use anchor_lang::{
    prelude::{Clock, Pubkey},
    solana_program::{instruction::Instruction, system_program},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use anchor_spl::token::spl_token;
use fork_contracts::{accounts as a, instruction as ix, math, state::*};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionMetadata},
    LiteSVM,
};
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_program_pack::Pack;
use solana_signer::Signer;
use solana_system_interface::instruction::create_account;
use solana_transaction::versioned::VersionedTransaction;
const U: u64 = 1_000_000;
const NOW: i64 = 1_800_000_000;
fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &fork_contracts::id()).0
}
fn instruction<A: ToAccountMetas, D: InstructionData>(accounts: A, data: D) -> Instruction {
    Instruction {
        program_id: fork_contracts::id(),
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    }
}
fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    signers: &[&Keypair],
    ixs: &[Instruction],
) -> Result<TransactionMetadata, Box<FailedTransactionMetadata>> {
    svm.expire_blockhash();
    let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &svm.latest_blockhash());
    let mut all = vec![payer];
    for s in signers {
        if s.pubkey() != payer.pubkey() {
            all.push(s);
        }
    }
    svm.send_transaction(
        VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &all).unwrap(),
    )
    .map_err(Box::new)
}
struct H {
    svm: LiteSVM,
    users: Vec<Keypair>,
    tokens: Vec<Pubkey>,
    mint: Pubkey,
    config: Pubkey,
    events: [Pubkey; 2],
    market: Pubkey,
    vault: Pubkey,
    max_cu: u64,
}
impl H {
    fn new(log_odds: i64) -> Self {
        Self::configured(log_odds, 0, None)
    }
    fn configured(log_odds: i64, fee_bps: u16, budget: Option<u64>) -> Self {
        let mut svm = LiteSVM::new();
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../target/deploy/fork_contracts.so");
        svm.add_program(
            fork_contracts::id(),
            &std::fs::read(path).expect("run anchor build first"),
        )
        .unwrap();
        let mut clock = svm.get_sysvar::<Clock>();
        clock.unix_timestamp = NOW;
        svm.set_sysvar(&clock);
        let users: Vec<_> = (0..6).map(|_| Keypair::new()).collect();
        for u in &users {
            svm.airdrop(&u.pubkey(), 10_000_000_000).unwrap();
        }
        let mk = Keypair::new();
        let mint = mk.pubkey();
        send(
            &mut svm,
            &users[0],
            &[&mk],
            &[
                create_account(&users[0].pubkey(), &mint, svm_rent(82), 82, &spl_token::ID),
                spl_token::instruction::initialize_mint2(
                    &spl_token::ID,
                    &mint,
                    &users[0].pubkey(),
                    None,
                    6,
                )
                .unwrap(),
            ],
        )
        .unwrap();
        let mut tokens = vec![];
        for u in &users {
            let t = Keypair::new();
            let key = t.pubkey();
            send(
                &mut svm,
                &users[0],
                &[&t],
                &[
                    create_account(&users[0].pubkey(), &key, svm_rent(165), 165, &spl_token::ID),
                    spl_token::instruction::initialize_account3(
                        &spl_token::ID,
                        &key,
                        &mint,
                        &u.pubkey(),
                    )
                    .unwrap(),
                    spl_token::instruction::mint_to(
                        &spl_token::ID,
                        &mint,
                        &key,
                        &users[0].pubkey(),
                        &[],
                        10_000 * U,
                    )
                    .unwrap(),
                ],
            )
            .unwrap();
            tokens.push(key);
        }
        let config = pda(&[b"config", users[0].pubkey().as_ref()]);
        let mut h = Self {
            svm,
            users,
            tokens,
            mint,
            config,
            events: [Pubkey::default(); 2],
            market: Pubkey::default(),
            vault: Pubkey::default(),
            max_cu: 0,
        };
        h.ok(
            instruction(
                a::InitializeConfig {
                    admin: h.key(0),
                    config,
                    mint,
                    system_program: system_program::ID,
                },
                ix::InitializeConfig {
                    reporter: h.key(5),
                    pause_authority: h.key(0),
                    max_trade: math::MAX_B,
                    max_deposits: math::MAX_Q,
                },
            ),
            0,
        );
        h.ok(
            instruction(
                a::Administer {
                    authority: h.key(0),
                    config,
                },
                ix::SetFee { fee_bps },
            ),
            0,
        );
        for j in 0..2 {
            let ticker = if j == 0 { "A" } else { "B" }.to_string();
            let instrument = format!("GEMI-{ticker}");
            let binding =
                solana_sha256_hasher::hashv(&[ticker.as_bytes(), &[0], instrument.as_bytes()])
                    .to_bytes();
            h.events[j] = pda(&[b"event", config.as_ref(), &binding]);
            h.ok(
                instruction(
                    a::RegisterEvent {
                        admin: h.key(0),
                        config,
                        event: h.events[j],
                        system_program: system_program::ID,
                    },
                    ix::RegisterEvent {
                        binding,
                        ticker,
                        instrument,
                        terms_hash: fixture_terms(j),
                        close_ts: NOW + 100 * (j as i64 + 1),
                        observation_ts: NOW + 100 * (j as i64 + 1) + 10,
                    },
                ),
                0,
            );
        }
        h.market = pda(&[
            b"market",
            config.as_ref(),
            h.events[0].as_ref(),
            h.events[1].as_ref(),
        ]);
        h.vault = pda(&[b"vault", h.market.as_ref()]);
        let create_accounts = a::CreateMarket {
            admin: h.key(0),
            config,
            parent: h.events[0],
            target: h.events[1],
            mint,
            market: h.market,
            vault: h.vault,
            token_program: spl_token::ID,
            system_program: system_program::ID,
        };
        let create = if let Some(budget) = budget {
            instruction(
                create_accounts,
                ix::CreateMarketForBudget {
                    budget,
                    initial_log_odds_e6: log_odds,
                },
            )
        } else {
            instruction(
                create_accounts,
                ix::CreateMarket {
                    b: 100 * U,
                    initial_log_odds_e6: log_odds,
                },
            )
        };
        h.ok(create, 0);
        for i in [1, 2] {
            h.ok(
                instruction(
                    a::OpenTrader {
                        owner: h.key(i),
                        market: h.market,
                        trader: h.trader_key(i),
                        system_program: system_program::ID,
                    },
                    ix::OpenTrader {},
                ),
                i,
            );
            h.ok(instruction(h.tf(i), ix::Deposit { amount: 1000 * U }), i);
        }
        for i in [3, 4] {
            h.ok(
                instruction(
                    a::OpenLp {
                        owner: h.key(i),
                        market: h.market,
                        lp: h.lp_key(i),
                        system_program: system_program::ID,
                    },
                    ix::OpenLp {},
                ),
                i,
            );
        }
        h
    }
    fn key(&self, i: usize) -> Pubkey {
        self.users[i].pubkey()
    }
    fn trader_key(&self, i: usize) -> Pubkey {
        pda(&[b"trader", self.market.as_ref(), self.key(i).as_ref()])
    }
    fn lp_key(&self, i: usize) -> Pubkey {
        pda(&[b"lp", self.market.as_ref(), self.key(i).as_ref()])
    }
    fn state<T: AccountDeserialize>(&self, k: Pubkey) -> T {
        T::try_deserialize(&mut &self.svm.get_account(&k).unwrap().data[..]).unwrap()
    }
    fn m(&self) -> Market {
        self.state(self.market)
    }
    fn t(&self, i: usize) -> Trader {
        self.state(self.trader_key(i))
    }
    fn balance(&self, k: Pubkey) -> u64 {
        spl_token::state::Account::unpack(&self.svm.get_account(&k).unwrap().data)
            .unwrap()
            .amount
    }
    fn exec(
        &mut self,
        ix: Instruction,
        who: usize,
    ) -> Result<TransactionMetadata, Box<FailedTransactionMetadata>> {
        let r = send(&mut self.svm, &self.users[who], &[], &[ix]);
        if let Ok(m) = &r {
            self.max_cu = self.max_cu.max(m.compute_units_consumed);
        }
        r
    }
    fn ok(&mut self, ix: Instruction, who: usize) {
        self.exec(ix, who).unwrap();
    }
    fn fail(&mut self, ix: Instruction, who: usize, code: u32) {
        let e = self
            .exec(ix, who)
            .expect_err("expected transaction rejection");
        assert!(
            e.meta
                .logs
                .iter()
                .any(|s| s.contains(&format!("Error Number: {code}"))),
            "wrong failure: {e:?}"
        );
    }
    fn clock(&mut self, t: i64) {
        let mut c = self.svm.get_sysvar::<Clock>();
        c.unix_timestamp = t;
        self.svm.set_sysvar(&c);
    }
    fn sm(&self) -> a::SyncMarket {
        a::SyncMarket {
            config: self.config,
            market: self.market,
            parent: self.events[0],
            target: self.events[1],
        }
    }
    fn tr(&self, i: usize) -> a::Trade {
        a::Trade {
            owner: self.key(i),
            config: self.config,
            market: self.market,
            parent: self.events[0],
            target: self.events[1],
            trader: self.trader_key(i),
        }
    }
    fn tf(&self, i: usize) -> a::TraderFunds {
        a::TraderFunds {
            owner: self.key(i),
            config: self.config,
            market: self.market,
            parent: self.events[0],
            target: self.events[1],
            trader: self.trader_key(i),
            mint: self.mint,
            vault: self.vault,
            user_token: self.tokens[i],
            token_program: spl_token::ID,
        }
    }
    fn lf(&self, i: usize) -> a::LpFunds {
        a::LpFunds {
            owner: self.key(i),
            config: self.config,
            market: self.market,
            parent: self.events[0],
            target: self.events[1],
            lp: self.lp_key(i),
            mint: self.mint,
            vault: self.vault,
            user_token: self.tokens[i],
            token_program: spl_token::ID,
        }
    }
    fn start(&mut self) {
        let subsidy = self.m().required_subsidy().unwrap();
        self.ok(
            instruction(
                self.lf(3),
                ix::FundLp {
                    amount: subsidy / 2,
                },
            ),
            3,
        );
        self.ok(
            instruction(
                self.lf(4),
                ix::FundLp {
                    amount: subsidy - subsidy / 2,
                },
            ),
            4,
        );
        self.ok(instruction(self.sm(), ix::StartMarket {}), 0);
        self.invariants();
    }
    fn trade_ix(&self, i: usize, yes: bool, buy: bool, amount: u64, limit: u64) -> Instruction {
        instruction(
            self.tr(i),
            ix::Trade {
                yes,
                buy,
                amount,
                limit,
            },
        )
    }
    fn trade(&mut self, i: usize, yes: bool, buy: bool, amount: u64) {
        self.ok(
            self.trade_ix(i, yes, buy, amount, if buy { u64::MAX } else { 0 }),
            i,
        );
        self.invariants();
    }
    fn report_ix(&self, j: usize, outcome: Outcome, source_ts: i64, who: usize) -> Instruction {
        let e: ExternalEvent = self.state(self.events[j]);
        instruction(
            a::Report {
                reporter: self.key(who),
                config: self.config,
                event: self.events[j],
            },
            ix::Report {
                binding: e.binding,
                terms_hash: e.terms_hash,
                outcome,
                source_ts,
            },
        )
    }
    fn report(&mut self, j: usize, outcome: Outcome, time: i64) {
        self.clock(time);
        self.ok(self.report_ix(j, outcome, time, 5), 5);
    }
    fn sync(&mut self) {
        self.ok(instruction(self.sm(), ix::SyncMarket {}), 0);
    }
    fn invariants(&self) {
        let m = self.m();
        let t = [self.t(1), self.t(2)];
        assert_eq!(m.principal, t.iter().map(|t| t.principal).sum::<u64>());
        assert_eq!(m.cash, t.iter().map(|t| t.cash).sum::<u64>());
        assert_eq!(m.yes, t.iter().map(|t| t.yes).sum::<u64>());
        assert_eq!(m.no, t.iter().map(|t| t.no).sum::<u64>());
        if !m.status.terminal() {
            assert_eq!(self.balance(self.vault), m.lp_deposits + m.principal);
            m.reserves_ok().unwrap();
        } else {
            assert!(self.balance(self.vault) >= m.trader_remaining + m.lp_remaining);
        }
    }
    fn finish(&mut self, reverse: bool) -> [u64; 4] {
        self.sync();
        let m = self.m();
        assert!(m.status.terminal());
        let expected: Vec<_> = [1, 2]
            .iter()
            .map(|&i| {
                let t = self.t(i);
                match m.status {
                    Status::Void => t.principal,
                    Status::SettledYes => t.cash + t.yes,
                    _ => t.cash + t.no,
                }
            })
            .collect();
        let mut paid = [0; 4];
        let order = if reverse {
            vec![4, 2, 3, 1]
        } else {
            vec![1, 3, 2, 4]
        };
        for i in order {
            let before = self.balance(self.tokens[i]);
            if i <= 2 {
                self.ok(instruction(self.tf(i), ix::Redeem {}), i);
                assert_eq!(self.balance(self.tokens[i]) - before, expected[i - 1]);
            } else {
                let l: Lp = self.state(self.lp_key(i));
                let amount = if m.status == Status::Void {
                    l.deposited
                } else {
                    math::prorata(m.lp_pool, l.deposited, m.lp_deposits).unwrap()
                };
                self.ok(instruction(self.lf(i), ix::WithdrawLp { amount }), i);
                assert_eq!(self.balance(self.tokens[i]) - before, amount);
            }
            paid[i - 1] = self.balance(self.tokens[i]) - before;
            self.invariants();
        }
        assert_eq!(self.m().trader_remaining, 0);
        assert!(self.balance(self.vault) <= 1);
        self.fail(instruction(self.tf(1), ix::Redeem {}), 1, 6009);
        println!("LiteSVM max CU (including setup) = {}", self.max_cu);
        paid
    }
}
fn svm_rent(n: usize) -> u64 {
    (n as u64 + 128) * 6960
}

#[test]
fn initialization_and_funding_constraints() {
    let mut h = H::new(0);
    let c: Config = h.state(h.config);
    assert_eq!(c.mint, h.mint);
    assert_eq!(c.fee_bps, 0);
    let v = spl_token::state::Account::unpack(&h.svm.get_account(&h.vault).unwrap().data).unwrap();
    assert_eq!(v.owner, h.market);
    assert_eq!(v.mint, h.mint);
    h.fail(instruction(h.sm(), ix::StartMarket {}), 0, 6007);
    h.ok(instruction(h.lf(3), ix::FundLp { amount: 80 * U }), 3);
    h.ok(instruction(h.lf(3), ix::WithdrawLp { amount: 10 * U }), 3);
    assert_eq!(h.m().lp_deposits, 70 * U);
    h.ok(instruction(h.sm(), ix::StartMarket {}), 0);
    h.fail(instruction(h.lf(3), ix::WithdrawLp { amount: 1 }), 3, 6008);
    h.fail(instruction(h.lf(4), ix::FundLp { amount: U }), 4, 6004);
    h.fail(instruction(h.sm(), ix::StartMarket {}), 0, 6004);
}
#[test]
fn buy_sell_partial_full_and_reversal() {
    let mut h = H::new(0);
    h.start();
    h.trade(1, true, true, 100 * U);
    h.trade(2, false, true, 80 * U);
    h.trade(1, true, false, 30 * U);
    h.trade(1, true, false, 70 * U);
    h.trade(1, false, true, 60 * U);
    h.trade(1, false, false, 60 * U);
    h.trade(2, false, false, 80 * U);
    assert_eq!(h.m().yes, 0);
    assert_eq!(h.m().no, 0);
    assert!(h.m().cash <= h.m().principal);
    h.report(0, Outcome::Yes, NOW + 110);
    h.trade(1, false, true, 10 * U);
    h.report(1, Outcome::No, NOW + 210);
    h.finish(false);
}
#[test]
fn profitable_early_exit_is_cancelled_on_void() {
    let mut h = H::new(0);
    h.start();
    h.trade(1, true, true, 100 * U);
    h.trade(2, true, true, 200 * U);
    h.trade(1, true, false, 100 * U);
    assert!(h.t(1).cash > h.t(1).principal);
    assert_eq!(h.t(1).yes, 0);
    h.trade(2, true, false, 200 * U);
    assert!(h.t(2).cash < h.t(2).principal);
    h.fail(instruction(h.tf(1), ix::Redeem {}), 1, 6008);
    h.report(0, Outcome::No, NOW + 110);
    h.finish(true);
    assert_eq!(h.balance(h.tokens[1]), 10_000 * U);
    assert_eq!(h.balance(h.tokens[2]), 10_000 * U);
    let before = h.balance(h.vault);
    h.report(1, Outcome::Yes, NOW + 210);
    h.sync();
    assert_eq!(h.balance(h.vault), before);
    assert_eq!(h.m().status, Status::Void);
}
#[test]
fn settlement_permutations_and_claim_order_are_identical() {
    for parent in [Outcome::Yes, Outcome::No] {
        for target in [Outcome::Yes, Outcome::No] {
            let mut results = vec![];
            for b_first in [false, true] {
                for reverse_claim in [false, true] {
                    let mut h = H::new(0);
                    h.start();
                    h.trade(1, true, true, 100 * U);
                    h.trade(2, false, true, 40 * U);
                    h.trade(1, true, false, 20 * U);
                    h.clock(NOW + 220);
                    for j in if b_first { [1, 0] } else { [0, 1] } {
                        h.report(j, if j == 0 { parent } else { target }, NOW + 220);
                        if j == 1 {
                            h.fail(h.trade_ix(1, true, true, U, u64::MAX), 1, 6003);
                        }
                        h.sync();
                    }
                    results.push(h.finish(reverse_claim));
                }
            }
            assert!(results.iter().all(|r| r == &results[0]));
        }
    }
}
#[test]
fn close_boundary_delays_and_activation() {
    let mut h = H::new(0);
    h.start();
    h.clock(NOW + 99);
    h.trade(1, true, true, U);
    h.clock(NOW + 100);
    h.fail(h.trade_ix(1, true, true, U, u64::MAX), 1, 6003);
    assert_eq!(
        h.state::<ExternalEvent>(h.events[0]).outcome,
        Outcome::Unresolved
    );
    h.report(0, Outcome::Yes, NOW + 110);
    h.trade(1, true, true, U);
    h.clock(NOW + 199);
    h.trade(2, false, true, U);
    h.clock(NOW + 200);
    h.fail(h.trade_ix(1, true, true, U, u64::MAX), 1, 6003);
    h.clock(NOW + 10_000);
    h.sync();
    assert_eq!(h.m().status, Status::Active);
    h.report(1, Outcome::Yes, NOW + 10_000);
    h.finish(false);
}
#[test]
fn invalid_review_duplicate_conflict_and_report_auth() {
    let mut h = H::new(0);
    h.start();
    h.trade(1, true, true, 50 * U);
    h.clock(NOW + 50);
    h.fail(h.report_ix(0, Outcome::Yes, NOW + 50, 5), 5, 6011);
    h.fail(h.report_ix(0, Outcome::Invalid, NOW + 50, 1), 1, 6001);
    h.fail(h.report_ix(0, Outcome::Invalid, NOW + 81, 5), 5, 6011);
    h.report(1, Outcome::Unresolved, NOW + 50);
    h.fail(h.trade_ix(1, true, true, U, u64::MAX), 1, 6003);
    h.sync();
    assert_eq!(h.m().status, Status::Halted);
    h.fail(h.report_ix(1, Outcome::Unresolved, NOW + 49, 5), 5, 6011);
    h.report(1, Outcome::Invalid, NOW + 51);
    h.ok(h.report_ix(1, Outcome::Invalid, NOW + 51, 5), 5);
    h.fail(h.report_ix(1, Outcome::Yes, NOW + 210, 5), 5, 6010);
    h.finish(false);
    assert_eq!(h.balance(h.tokens[1]), 10_000 * U);
}
#[test]
fn non_balanced_price_slippage_numeric_and_position_limits() {
    let mut h = H::new(1_386_294);
    h.start();
    let m = h.m();
    let p = math::price(m.offset_yes, 0, m.b).unwrap();
    assert!((p as f64 / 1e18 - 0.8).abs() < 1e-6);
    h.fail(h.trade_ix(1, true, true, U, 0), 1, 6006);
    h.fail(h.trade_ix(1, true, true, 0, u64::MAX), 1, 6000);
    h.fail(h.trade_ix(1, true, true, u64::MAX, u64::MAX), 1, 6000);
    h.fail(h.trade_ix(1, true, false, U, 0), 1, 6005);
    h.trade(1, true, true, U);
    h.fail(h.trade_ix(1, true, false, U, u64::MAX), 1, 6006);
    let before = h.t(1).cash;
    for _ in 0..50 {
        h.trade(1, true, true, 1);
        h.trade(1, true, false, 1);
    }
    assert!(h.t(1).cash <= before);
    h.report(0, Outcome::Yes, NOW + 110);
    h.report(1, Outcome::Yes, NOW + 210);
    h.finish(false);
}
#[test]
fn randomized_trade_sequences_conserve_every_micro_unit() {
    for seed in 1..=12u64 {
        let mut h = H::configured(0, if seed <= 6 { 0 } else { (seed * 71) as u16 }, None);
        h.start();
        let mut rng = seed;
        for _ in 0..80 {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1);
            let who = 1 + ((rng >> 12) & 1) as usize;
            let yes = (rng >> 13) & 1 == 0;
            let buy = (rng >> 14) & 1 == 0;
            let t = h.t(who);
            let held = if yes { t.yes } else { t.no };
            let amount = (1 + rng % 5) * U;
            if buy {
                h.trade(who, yes, true, amount);
            } else if held > 0 {
                h.trade(who, yes, false, amount.min(held));
            }
        }
        h.report(
            0,
            if seed % 3 == 0 {
                Outcome::No
            } else {
                Outcome::Yes
            },
            NOW + 110,
        );
        h.report(
            1,
            if seed % 2 == 0 {
                Outcome::No
            } else {
                Outcome::Yes
            },
            NOW + 210,
        );
        h.finish(seed % 2 == 0);
    }
}
#[test]
fn lp_worst_case_loss_does_not_impair_payouts() {
    let mut h = H::new(0);
    h.start();
    h.trade(1, true, true, 900 * U);
    h.trade(2, true, true, 900 * U);
    h.report(0, Outcome::Yes, NOW + 110);
    h.report(1, Outcome::Yes, NOW + 210);
    h.sync();
    assert!(h.m().lp_pool < 100);
    let paid = h.finish(true);
    assert!(paid[0] > 1000 * U);
    assert!(paid[1] >= 1000 * U);
}
#[test]
fn malicious_accounts_and_authority_transfer() {
    let mut h = H::new(0);
    h.start();
    let mut bad = h.tf(1);
    bad.user_token = h.tokens[2];
    assert!(h
        .exec(instruction(bad, ix::Deposit { amount: U }), 1)
        .is_err());
    let mut bad = h.tr(1);
    bad.trader = h.trader_key(2);
    assert!(h
        .exec(
            instruction(
                bad,
                ix::Trade {
                    yes: true,
                    buy: true,
                    amount: U,
                    limit: u64::MAX
                }
            ),
            1
        )
        .is_err());
    let mut bad = h.tr(1);
    bad.parent = h.events[1];
    assert!(h
        .exec(
            instruction(
                bad,
                ix::Trade {
                    yes: true,
                    buy: true,
                    amount: U,
                    limit: u64::MAX
                }
            ),
            1
        )
        .is_err());
    h.fail(
        instruction(
            a::Administer {
                authority: h.key(1),
                config: h.config,
            },
            ix::SetPause { paused: true },
        ),
        1,
        6001,
    );
    h.ok(
        instruction(
            a::Administer {
                authority: h.key(0),
                config: h.config,
            },
            ix::SetPause { paused: true },
        ),
        0,
    );
    h.fail(h.trade_ix(1, true, true, U, u64::MAX), 1, 6003);
    h.ok(
        instruction(
            a::Administer {
                authority: h.key(0),
                config: h.config,
            },
            ix::ProposeAdmin { next: h.key(1) },
        ),
        0,
    );
    h.fail(
        instruction(
            a::Administer {
                authority: h.key(2),
                config: h.config,
            },
            ix::AcceptAdmin {},
        ),
        2,
        6001,
    );
    h.ok(
        instruction(
            a::Administer {
                authority: h.key(1),
                config: h.config,
            },
            ix::AcceptAdmin {},
        ),
        1,
    );
    h.fail(
        instruction(
            a::Administer {
                authority: h.key(0),
                config: h.config,
            },
            ix::SetAuthorities {
                reporter: h.key(2),
                pause_authority: h.key(2),
            },
        ),
        0,
        6001,
    );
    h.ok(
        instruction(
            a::Administer {
                authority: h.key(1),
                config: h.config,
            },
            ix::SetPause { paused: false },
        ),
        1,
    );
    h.trade(1, true, true, U);
    h.invariants();
}

fn fixture_terms(j: usize) -> [u8; 32] {
    let v: serde_json::Value =
        serde_json::from_str(include_str!("../../../fixtures/registrations.json")).unwrap();
    let hex = v[j]["termsHash"].as_str().unwrap();
    let mut out = [0u8; 32];
    for i in 0..32 {
        out[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap();
    }
    out
}
#[test]
fn typescript_oracle_adapter_submits_actual_anchor_instruction() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let output = std::process::Command::new("node")
        .args(["--import", "tsx", "scripts/oracle-fixture.ts"])
        .current_dir(root)
        .output()
        .expect("npm ci first");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let v: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    let mut h = H::new(0);
    h.start();
    h.trade(1, true, true, 20 * U);
    h.clock(NOW + 220);
    let data = v["instruction"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_u64().unwrap() as u8)
        .collect();
    h.ok(
        Instruction {
            program_id: fork_contracts::id(),
            accounts: a::Report {
                reporter: h.key(5),
                config: h.config,
                event: h.events[0],
            }
            .to_account_metas(None),
            data,
        },
        5,
    );
    assert_eq!(h.state::<ExternalEvent>(h.events[0]).outcome, Outcome::Yes);
    h.report(1, Outcome::No, NOW + 220);
    h.finish(false);
}

#[test]
fn onchain_quote_matches_execution_and_cannot_mutate_state() {
    let mut h = H::new(0);
    h.start();
    let before = h.svm.get_account(&h.market).unwrap().data;
    let q = instruction(
        a::Quote {
            owner: h.key(1),
            config: h.config,
            market: h.market,
            parent: h.events[0],
            target: h.events[1],
            trader: h.trader_key(1),
        },
        ix::Quote {
            yes: true,
            buy: true,
            amount: 100 * U,
        },
    );
    assert!(q.accounts.iter().all(|a| !a.is_writable));
    let r = h.exec(q, 1).unwrap();
    let cost = u64::from_le_bytes(r.return_data.data.try_into().unwrap());
    assert_eq!(h.svm.get_account(&h.market).unwrap().data, before);
    let cash = h.t(1).cash;
    h.ok(h.trade_ix(1, true, true, 100 * U, cost), 1);
    assert_eq!(cash - h.t(1).cash, cost);
    println!("onchain quote CU={}", r.compute_units_consumed);
}
#[test]
fn final_publication_may_precede_last_observed_halt() {
    let mut h = H::new(0);
    h.start();
    h.trade(1, true, true, U);
    h.report(0, Outcome::Unresolved, NOW + 150);
    h.ok(h.report_ix(0, Outcome::Yes, NOW + 110, 5), 5);
    h.trade(1, true, false, U);
    h.report(1, Outcome::Invalid, NOW + 151);
    h.finish(false);
}
#[test]
fn failed_operations_rollback_and_wrong_report_binding_is_rejected() {
    let mut h = H::new(0);
    h.start();
    let before = h.svm.get_account(&h.market).unwrap().data;
    h.fail(h.trade_ix(1, true, true, 5000 * U, u64::MAX), 1, 6005);
    assert_eq!(h.svm.get_account(&h.market).unwrap().data, before);
    let e: ExternalEvent = h.state(h.events[0]);
    h.fail(
        instruction(
            a::Report {
                reporter: h.key(5),
                config: h.config,
                event: h.events[0],
            },
            ix::Report {
                binding: [0; 32],
                terms_hash: e.terms_hash,
                outcome: Outcome::Invalid,
                source_ts: NOW,
            },
        ),
        5,
        6002,
    );
    h.fail(
        instruction(
            a::Report {
                reporter: h.key(5),
                config: h.config,
                event: h.events[0],
            },
            ix::Report {
                binding: e.binding,
                terms_hash: [0; 32],
                outcome: Outcome::Invalid,
                source_ts: NOW,
            },
        ),
        5,
        6002,
    );
    h.report(0, Outcome::Invalid, NOW + 1);
    h.finish(true);
}

#[test]
fn research_bigint_quotes_match_rust_at_numerical_boundaries() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let output = std::process::Command::new("node")
        .args(["--import", "tsx", "scripts/quote-vectors.ts"])
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let vectors: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout).unwrap();
    for v in &vectors {
        let n = |k: &str| v[k].as_str().unwrap().parse::<u64>().unwrap();
        assert_eq!(
            math::potential(n("y"), n("n"), n("b")).unwrap(),
            n("potential")
        );
        assert_eq!(
            math::quote(
                n("y"),
                n("n"),
                n("b"),
                v["yes"].as_bool().unwrap(),
                v["buy"].as_bool().unwrap(),
                n("amount")
            )
            .unwrap(),
            n("cost")
        );
    }
    println!(
        "Rust/TypeScript exact differential vectors={}",
        vectors.len()
    );
}

#[test]
fn fees_are_immutable_quoted_and_cancelled_only_on_void() {
    for outcome in [Outcome::Yes, Outcome::No, Outcome::Invalid] {
        let mut h = H::configured(0, 137, Some(80 * U));
        assert!(h.m().b > 115 * U);
        assert!(h.m().required_subsidy().unwrap() <= 80 * U);
        h.start();
        h.fail(
            instruction(
                a::Administer {
                    authority: h.key(1),
                    config: h.config,
                },
                ix::SetFee { fee_bps: 0 },
            ),
            1,
            6001,
        );
        h.fail(
            instruction(
                a::Administer {
                    authority: h.key(0),
                    config: h.config,
                },
                ix::SetFee { fee_bps: 1001 },
            ),
            0,
            6000,
        );
        h.ok(
            instruction(
                a::Administer {
                    authority: h.key(0),
                    config: h.config,
                },
                ix::SetFee { fee_bps: 0 },
            ),
            0,
        );
        assert_eq!(h.m().fee_bps, 137);
        let mut fees = 0;
        for (i, yes, buy, amount) in [
            (1, true, true, 100 * U),
            (2, true, true, 200 * U),
            (1, true, false, 100 * U),
            (2, true, false, 50 * U),
            (1, false, true, 40 * U),
        ] {
            let m = h.m();
            let gross = math::quote(
                m.yes + m.offset_yes,
                m.no + m.offset_no,
                m.b,
                yes,
                buy,
                amount,
            )
            .unwrap();
            let (net, fee) = math::with_fee(gross, 137, buy).unwrap();
            fees += fee;
            let tr = h.tr(i);
            let q = h
                .exec(
                    instruction(
                        a::Quote {
                            owner: tr.owner,
                            config: tr.config,
                            market: tr.market,
                            parent: tr.parent,
                            target: tr.target,
                            trader: tr.trader,
                        },
                        ix::Quote { yes, buy, amount },
                    ),
                    i,
                )
                .unwrap();
            assert_eq!(
                u64::from_le_bytes(q.return_data.data.try_into().unwrap()),
                net
            );
            let cash = h.t(i).cash;
            h.fail(
                h.trade_ix(i, yes, buy, amount, if buy { net - 1 } else { net + 1 }),
                i,
                6006,
            );
            assert_eq!(h.m().fees_accrued, fees - fee);
            h.ok(h.trade_ix(i, yes, buy, amount, net), i);
            assert_eq!(h.t(i).cash, if buy { cash - net } else { cash + net });
            h.invariants();
        }
        assert_eq!(h.m().fees_accrued, fees);
        assert!(fees > U);
        h.fail(instruction(h.lf(3), ix::WithdrawLp { amount: 1 }), 3, 6008);
        h.fail(instruction(h.lf(4), ix::FundLp { amount: U }), 4, 6004);
        h.report(0, Outcome::Yes, NOW + 110);
        h.report(1, outcome, NOW + 210);
        h.sync();
        if outcome == Outcome::Invalid {
            assert_eq!(h.m().lp_pool, h.m().lp_deposits);
        }
        h.finish(outcome == Outcome::Invalid);
        let l: Lp = h.state(h.lp_key(3));
        h.fail(
            instruction(h.lf(3), ix::WithdrawLp { amount: l.paid }),
            3,
            6009,
        );
        if outcome == Outcome::Invalid {
            assert_eq!(h.balance(h.tokens[1]), 10_000 * U);
            assert_eq!(h.balance(h.tokens[2]), 10_000 * U);
        }
    }
}

#[test]
fn fee_income_does_not_guarantee_lp_profit_and_funding_cannot_dilute() {
    let mut h = H::configured(0, 100, Some(70 * U));
    h.ok(instruction(h.lf(3), ix::FundLp { amount: 10 * U }), 3);
    h.ok(instruction(h.lf(4), ix::FundLp { amount: 30 * U }), 4);
    h.ok(instruction(h.lf(3), ix::WithdrawLp { amount: 5 * U }), 3);
    h.fail(instruction(h.sm(), ix::StartMarket {}), 0, 6007);
    h.ok(instruction(h.lf(3), ix::FundLp { amount: 35 * U }), 3);
    let mut attack = h.lf(3);
    attack.owner = h.key(4);
    h.fail(instruction(attack, ix::WithdrawLp { amount: U }), 4, 2006);
    h.ok(instruction(h.sm(), ix::StartMarket {}), 1);
    h.trade(1, true, true, 900 * U);
    h.report(0, Outcome::Yes, NOW + 110);
    h.report(1, Outcome::Yes, NOW + 210);
    h.sync();
    assert!(h.m().fees_accrued > 0);
    assert!(h.m().lp_pool < h.m().lp_deposits / 5);
    let pool = h.m().lp_pool;
    h.finish(false);
    let a: Lp = h.state(h.lp_key(3));
    let b: Lp = h.state(h.lp_key(4));
    assert_eq!(a.paid, math::prorata(pool, 40 * U, 70 * U).unwrap());
    assert_eq!(b.paid, math::prorata(pool, 30 * U, 70 * U).unwrap());
}

#[test]
fn v1_migration_preserves_every_byte_and_claims_and_cannot_reset_fees() {
    for terminal in [false, true] {
        let mut h = H::new(0);
        h.start();
        h.trade(1, true, true, 100 * U);
        if terminal {
            h.report(0, Outcome::Yes, NOW + 110);
            h.report(1, Outcome::No, NOW + 210);
            h.sync();
            h.ok(instruction(h.tf(1), ix::Redeem {}), 1);
        }
        let mut old = h.svm.get_account(&h.market).unwrap();
        old.data.truncate(old.data.len() - 10);
        // Model the actual V1 rent balance so migration must execute its top-up CPI.
        old.lamports = svm_rent(old.data.len());
        let prefix = old.data.clone();
        h.svm.set_account(h.market, old).unwrap();
        let migrate = || {
            instruction(
                a::MigrateMarket {
                    payer: h.key(2),
                    market: h.market,
                    system_program: system_program::ID,
                },
                ix::MigrateMarket {},
            )
        };
        let ix = migrate();
        h.ok(ix.clone(), 2);
        assert_eq!(
            &h.svm.get_account(&h.market).unwrap().data[..prefix.len()],
            prefix.as_slice()
        );
        assert!(h.svm.get_account(&h.market).unwrap().lamports >= svm_rent(prefix.len() + 10));
        assert_eq!(h.m().fee_bps, 0);
        assert_eq!(h.m().fees_accrued, 0);
        h.ok(ix, 2);
        if terminal {
            h.fail(instruction(h.tf(1), ix::Redeem {}), 1, 6009);
            h.ok(instruction(h.tf(2), ix::Redeem {}), 2);
        } else {
            h.trade(2, false, true, 50 * U);
            h.report(0, Outcome::No, NOW + 110);
            h.finish(true);
        }
    }
    let mut h = H::configured(0, 100, None);
    h.start();
    h.trade(1, true, true, U);
    let before = h.svm.get_account(&h.market).unwrap().data;
    let ix = instruction(
        a::MigrateMarket {
            payer: h.key(1),
            market: h.market,
            system_program: system_program::ID,
        },
        ix::MigrateMarket {},
    );
    h.ok(ix, 1);
    assert_eq!(before, h.svm.get_account(&h.market).unwrap().data);
    let bad = instruction(
        a::MigrateMarket {
            payer: h.key(1),
            market: h.config,
            system_program: system_program::ID,
        },
        ix::MigrateMarket {},
    );
    assert!(h.exec(bad, 1).is_err());
}
