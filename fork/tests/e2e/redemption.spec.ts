import { openTradeMarket, mockMarketEvents } from "../helpers/trade-market";
import { test, expect } from "@playwright/test";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { BN, Program } from "@anchor-lang/core";
import {
  NATIVE_MINT,
  createSyncNativeInstruction,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { installLocalWallet } from "../helpers/local-wallet";
import idl from "../../src/lib/contracts/generated/idl.json";
import type { ForkContracts } from "../../src/lib/contracts/generated/fork_contracts";
import type {
  AppConfig,
  MarketDescriptor,
} from "../../src/lib/contracts/generated/app-types";

// Fixture configuration is isolated from the real Gemini oracle service. Only discovery
// DTOs are routed; every account, report, settlement and wallet redemption is on-chain.
for (const outcome of ["void", "settledYes", "settledNo"] as const) {
  test(`synthetic settlement fixture: browser redeems ${outcome} exactly once`, async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      process.env.RUN_SOLANA_FIXTURES !== "1",
      "Explicit local validator fixture run only.",
    );
    test.setTimeout(120_000);
    const original = (await (await request.get("/api/sol/config")).json())
      .data as AppConfig;
    expect(original.cluster).toBe("localnet");
    const connection = new Connection(original.rpc, "confirmed");
    const admin = Keypair.generate();
    const wallet = await installLocalWallet(page);
    const owner = wallet.signers[0].publicKey;
    const program = new Program<ForkContracts>(idl as ForkContracts, {
      connection,
    });
    const pda = (...seeds: (string | PublicKey | Uint8Array)[]) =>
      PublicKey.findProgramAddressSync(
        seeds.map((seed) =>
          typeof seed === "string"
            ? Buffer.from(seed)
            : seed instanceof PublicKey
              ? seed.toBuffer()
              : Buffer.from(seed),
        ),
        program.programId,
      )[0];
    const unit = (value: number) => new BN(value * 1_000_000);
    const send = async (ix: TransactionInstruction, extra: Keypair[] = []) => {
      const lifetime = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: admin.publicKey,
        ...lifetime,
      }).add(ix);
      tx.sign(admin, ...extra);
      const simulation = await connection.simulateTransaction(tx);
      expect(simulation.value.err).toBeNull();
      const signature = await connection.sendRawTransaction(tx.serialize());
      expect(
        (
          await connection.confirmTransaction(
            { signature, ...lifetime },
            "confirmed",
          )
        ).value.err,
      ).toBeNull();
      return signature;
    };
    for (const key of [admin.publicKey, owner]) {
      const sig = await connection.requestAirdrop(key, 2_000_000_000);
      expect(
        (await connection.confirmTransaction(sig, "confirmed")).value.err,
      ).toBeNull();
    }
    const mint = NATIVE_MINT;
    const config = pda("config-sol", admin.publicKey);
    await send(
      await program.methods
        .initializeSolConfig(
          admin.publicKey,
          admin.publicKey,
          unit(1000),
          unit(1000000),
        )
        .accountsStrict({
          admin: admin.publicKey,
          config,
          mint,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    );
    const now = (await connection.getBlockTime(
      await connection.getSlot("confirmed"),
    ))!;
    const bindings = ["A", "B"].map((role) => ({
      ticker: `FIXTURE-${role}`,
      instrument: `SYNTHETIC-${role}`,
      termsHash: createHash("sha256")
        .update("synthetic rules; not Gemini")
        .digest("hex"),
      closeTs: now + 20,
      observationTs: now + 20,
    }));
    const hashes = bindings.map((b) =>
      createHash("sha256").update(`${b.ticker}\0${b.instrument}`).digest(),
    );
    const [parent, target] = hashes.map((hash) => pda("event", config, hash));
    for (const [index, event] of [parent, target].entries()) {
      const b = bindings[index];
      await send(
        await program.methods
          .registerEvent(
            [...hashes[index]],
            b.ticker,
            b.instrument,
            [...Buffer.from(b.termsHash, "hex")],
            new BN(b.closeTs),
            new BN(b.observationTs),
          )
          .accountsStrict({
            admin: admin.publicKey,
            config,
            event,
            systemProgram: SystemProgram.programId,
          })
          .instruction(),
      );
    }
    const market = pda("market", config, parent, target),
      vault = pda("vault", market),
      lp = pda("lp", market, admin.publicKey),
      trader = pda("trader", market, owner);
    await send(
      await program.methods
        .createMarket(unit(100), new BN(0))
        .accountsStrict({
          admin: admin.publicKey,
          config,
          parent,
          target,
          mint,
          market,
          vault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    );
    const lpToken = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        admin,
        mint,
        admin.publicKey,
      )
    ).address;
    const userToken = (
      await getOrCreateAssociatedTokenAccount(connection, admin, mint, owner)
    ).address;
    for (const [account, lamports] of [
      [lpToken, 80_000_000],
      [userToken, 100_000_000],
    ] as const) {
      await send(
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: account,
          lamports,
        }),
      );
      await send(createSyncNativeInstruction(account));
    }
    await send(
      await program.methods
        .openLp()
        .accountsStrict({
          owner: admin.publicKey,
          market,
          lp,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    );
    await send(
      await program.methods
        .fundLp(unit(80))
        .accountsStrict({
          owner: admin.publicKey,
          config,
          market,
          parent,
          target,
          lp,
          mint,
          vault,
          userToken: lpToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
    );
    const marketAccounts = { config, market, parent, target };
    await send(
      await program.methods
        .startMarket()
        .accountsStrict(marketAccounts)
        .instruction(),
    );
    await send(
      await program.methods
        .openTrader()
        .accountsStrict({
          owner,
          market,
          trader,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
      [wallet.signers[0]],
    );
    await send(
      await program.methods
        .deposit(unit(100))
        .accountsStrict({
          owner,
          trader,
          ...marketAccounts,
          mint,
          vault,
          userToken,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction(),
      [wallet.signers[0]],
    );
    await send(
      await program.methods
        .trade(true, true, unit(10), unit(100))
        .accountsStrict({ owner, trader, ...marketAccounts })
        .instruction(),
      [wallet.signers[0]],
    );
    const position = await program.account.trader.fetch(trader);
    const expected =
      outcome === "void"
        ? position.principal
        : outcome === "settledYes"
          ? position.cash.add(position.yes)
          : position.cash.add(position.no);
    // Real validator time passes; the outcome below is explicitly synthetic test evidence.
    while (
      (await connection.getBlockTime(await connection.getSlot("confirmed")))! <
      bindings[0].observationTs
    )
      await new Promise((resolve) => setTimeout(resolve, 500));
    for (const [index, event] of [parent, target].entries()) {
      const result =
        index === 0
          ? outcome === "void"
            ? "no"
            : "yes"
          : outcome === "settledNo"
            ? "no"
            : "yes";
      await send(
        await program.methods
          .report(
            [...hashes[index]],
            [...Buffer.from(bindings[index].termsHash, "hex")],
            { [result]: {} },
            new BN(bindings[index].observationTs),
          )
          .accountsStrict({ reporter: admin.publicKey, config, event })
          .instruction(),
      );
    }
    await send(
      await program.methods
        .syncMarket()
        .accountsStrict(marketAccounts)
        .instruction(),
    );
    const fixtureConfig: AppConfig = {
      ...original,
      config: config.toBase58(),
      mint: mint.toBase58(),
    };
    const descriptor: MarketDescriptor = {
      address: market.toBase58(),
      parent: parent.toBase58(),
      target: target.toBase58(),
      vault: vault.toBase58(),
      bindings: bindings as MarketDescriptor["bindings"],
    };
    await page.route("**/api/sol/config", (route) =>
      route.fulfill({ json: { ok: true, data: fixtureConfig } }),
    );
    await page.route("**/api/sol/markets", (route) =>
      route.fulfill({ json: { ok: true, data: [descriptor] } }),
    );
    await mockMarketEvents(page, descriptor);
    await page.addInitScript(
      ({ genesis, address }) => {
        localStorage.clear();
        localStorage.setItem(
          "fork-universe-v1",
          JSON.stringify({ state: { engine: "demo" }, version: 1 }),
        );
        localStorage.setItem(`fork-market:${genesis}`, address);
      },
      { genesis: original.genesis, address: market.toBase58() },
    );
    await page.goto("/");
    await page.getByTestId("example-demo-btc-150k-2027").click();
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Fork verification wallet", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await openTradeMarket(page);
    const trading = page.getByTestId("trading");
    const display = `${Math.floor(expected.toNumber() / 1e9)}.${(expected.toNumber() % 1e9).toString().padStart(9, "0")}`;
    const walletBefore = await connection.getBalance(owner);
    const tokenBefore = (await getAccount(connection, userToken)).amount;
    await expect(trading.getByTestId("balance-withdrawable")).toHaveText(
      display,
    );
    await trading
      .getByRole("button", { name: /^Withdraw (refund|balance)$/ })
      .click();
    await expect(trading.getByTestId("balance-withdrawable")).toHaveText(
      "0.000000000",
    );
    await expect(
      trading.getByRole("button", { name: /^Withdraw (refund|balance)$/ }),
    ).toHaveCount(0);
    expect((await program.account.trader.fetch(trader)).claimed).toBe(true);
    const signature = await trading
      .locator("[data-signature]")
      .first()
      .getAttribute("data-signature");
    expect(
      (
        await connection.getTransaction(signature!, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        })
      )?.meta?.err,
    ).toBeNull();
    const confirmed = await connection.getTransaction(signature!, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    expect(await connection.getBalance(owner)).toBe(
      walletBefore + expected.toNumber() - confirmed!.meta!.fee,
    );
    expect((await getAccount(connection, userToken)).amount).toBe(tokenBefore);
    mkdirSync(".data", { recursive: true });
    writeFileSync(
      `.data/redemption-${outcome}.json`,
      JSON.stringify(
        {
          fixture: true,
          at: new Date().toISOString(),
          outcome,
          market: market.toBase58(),
          signature,
          payout: display,
        },
        null,
        2,
      ),
    );
    await testInfo.attach("synthetic-redemption", {
      body: JSON.stringify({
        fixture: true,
        outcome,
        market: market.toBase58(),
        signature,
        payout: display,
      }),
      contentType: "application/json",
    });
  });
}
