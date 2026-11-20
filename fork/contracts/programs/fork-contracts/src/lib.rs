pub mod error;
pub mod instructions;
pub mod math;
pub mod state;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, TransferChecked};
use error::MarketError as E;
pub use instructions::*;
use math::{add, sub};
pub use state::*;
declare_id!("13Z5QXDCa7bNddx55di4qxg7cAepcjy8BjDxag9bBJdN");

#[program]
pub mod fork_contracts {
    use super::*;
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        reporter: Pubkey,
        pause_authority: Pubkey,
        max_trade: u64,
        max_deposits: u64,
    ) -> Result<()> {
        require!(
            reporter != Pubkey::default() && pause_authority != Pubkey::default(),
            E::Binding
        );
        require!(
            max_trade > 0
                && max_trade <= math::MAX_B
                && max_deposits >= max_trade
                && max_deposits <= math::MAX_Q,
            E::Math
        );
        let c = &mut ctx.accounts.config;
        c.creator = ctx.accounts.admin.key();
        c.admin = c.creator;
        c.reporter = reporter;
        c.pause_authority = pause_authority;
        c.mint = ctx.accounts.mint.key();
        c.max_trade = max_trade;
        c.max_deposits = max_deposits;
        c.bump = ctx.bumps.config;
        Ok(())
    }
    pub fn propose_admin(ctx: Context<Administer>, next: Pubkey) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.admin,
            E::Unauthorized
        );
        require!(next != Pubkey::default(), E::Binding);
        ctx.accounts.config.pending_admin = next;
        Ok(())
    }
    pub fn accept_admin(ctx: Context<Administer>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.pending_admin,
            E::Unauthorized
        );
        ctx.accounts.config.admin = ctx.accounts.authority.key();
        ctx.accounts.config.pending_admin = Pubkey::default();
        Ok(())
    }
    pub fn set_authorities(
        ctx: Context<Administer>,
        reporter: Pubkey,
        pause_authority: Pubkey,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.authority.key(),
            ctx.accounts.config.admin,
            E::Unauthorized
        );
        require!(
            reporter != Pubkey::default() && pause_authority != Pubkey::default(),
            E::Binding
        );
        ctx.accounts.config.reporter = reporter;
        ctx.accounts.config.pause_authority = pause_authority;
        Ok(())
    }
    pub fn set_pause(ctx: Context<Administer>, paused: bool) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.admin
                || ctx.accounts.authority.key() == ctx.accounts.config.pause_authority,
            E::Unauthorized
        );
        ctx.accounts.config.paused = paused;
        Ok(())
    }
    pub fn register_event(
        ctx: Context<RegisterEvent>,
        binding: [u8; 32],
        ticker: String,
        instrument: String,
        terms_hash: [u8; 32],
        close_ts: i64,
        observation_ts: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            !ticker.is_empty()
                && ticker.len() <= 64
                && !instrument.is_empty()
                && instrument.len() <= 96
                && !ticker.contains('\0')
                && !instrument.contains('\0')
                && terms_hash != [0; 32],
            E::Binding
        );
        require!(
            solana_sha256_hasher::hashv(&[ticker.as_bytes(), &[0], instrument.as_bytes()])
                .to_bytes()
                == binding,
            E::Binding
        );
        require!(close_ts > now && observation_ts >= close_ts, E::Timestamp);
        let e = &mut ctx.accounts.event;
        e.config = ctx.accounts.config.key();
        e.binding = binding;
        e.ticker = ticker;
        e.instrument = instrument;
        e.terms_hash = terms_hash;
        e.close_ts = close_ts;
        e.observation_ts = observation_ts;
        e.registered_ts = now;
        e.outcome = Outcome::Unresolved;
        e.bump = ctx.bumps.event;
        Ok(())
    }
    pub fn report(
        ctx: Context<Report>,
        binding: [u8; 32],
        terms_hash: [u8; 32],
        outcome: Outcome,
        source_ts: i64,
    ) -> Result<()> {
        let e = &mut ctx.accounts.event;
        require!(
            binding == e.binding && terms_hash == e.terms_hash,
            E::Binding
        );
        if e.outcome != Outcome::Unresolved {
            require!(
                outcome == e.outcome && source_ts == e.source_ts,
                E::Conflict
            );
            return Ok(());
        }
        let now = Clock::get()?.unix_timestamp;
        require!(
            source_ts >= e.registered_ts
                && (outcome != Outcome::Unresolved || source_ts >= e.source_ts)
                && source_ts <= now.checked_add(30).ok_or(E::Math)?,
            E::Timestamp
        );
        if matches!(outcome, Outcome::Yes | Outcome::No) {
            require!(source_ts >= e.observation_ts, E::Timestamp);
        }
        // Unresolved reports are explicit source halts, never a fabricated NO.
        e.outcome = outcome;
        e.halted = outcome == Outcome::Unresolved;
        e.source_ts = source_ts;
        e.submitted_ts = now;
        emit!(ResolutionEvent {
            event: e.key(),
            outcome,
            halted: e.halted,
            source_ts
        });
        Ok(())
    }
    pub fn create_market(
        ctx: Context<CreateMarket>,
        b: u64,
        initial_log_odds_e6: i64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, E::NotTrading);
        let now = Clock::get()?.unix_timestamp;
        for e in [&ctx.accounts.parent, &ctx.accounts.target] {
            require!(
                e.outcome == Outcome::Unresolved && !e.halted && now < e.close_ts,
                E::Lifecycle
            );
        }
        require!(
            (1_000_000..=math::MAX_B).contains(&b)
                && initial_log_odds_e6.unsigned_abs() <= 16_000_000,
            E::Math
        );
        let offset = u64::try_from(
            (b as u128)
                .checked_mul(initial_log_odds_e6.unsigned_abs() as u128)
                .ok_or(E::Math)?
                / 1_000_000,
        )
        .map_err(|_| E::Math)?;
        let m = &mut ctx.accounts.market;
        m.config = ctx.accounts.config.key();
        m.parent = ctx.accounts.parent.key();
        m.target = ctx.accounts.target.key();
        m.mint = ctx.accounts.mint.key();
        m.vault = ctx.accounts.vault.key();
        m.b = b;
        m.offset_yes = if initial_log_odds_e6 >= 0 { offset } else { 0 };
        m.offset_no = if initial_log_odds_e6 < 0 { offset } else { 0 };
        m.status = Status::Funding;
        m.bump = ctx.bumps.market;
        m.required_subsidy()?;
        Ok(())
    }
    pub fn start_market(ctx: Context<SyncMarket>) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(!m.started && !m.status.terminal(), E::Lifecycle);
        require!(m.lp_deposits >= m.required_subsidy()?, E::Insolvent);
        m.started = true;
        m.trading(
            &ctx.accounts.config,
            &ctx.accounts.parent,
            &ctx.accounts.target,
            Clock::get()?.unix_timestamp,
        )?;
        m.sync(&ctx.accounts.parent, &ctx.accounts.target)?;
        Ok(())
    }
    pub fn sync_market(ctx: Context<SyncMarket>) -> Result<()> {
        let m = &mut ctx.accounts.market;
        m.sync(&ctx.accounts.parent, &ctx.accounts.target)?;
        emit!(LifecycleEvent {
            market: m.key(),
            status: m.status,
            trader_liability: m.trader_remaining,
            lp_equity: m.lp_remaining
        });
        Ok(())
    }
    pub fn open_trader(ctx: Context<OpenTrader>) -> Result<()> {
        require!(!ctx.accounts.market.status.terminal(), E::Lifecycle);
        let t = &mut ctx.accounts.trader;
        t.market = ctx.accounts.market.key();
        t.owner = ctx.accounts.owner.key();
        t.bump = ctx.bumps.trader;
        Ok(())
    }
    pub fn open_lp(ctx: Context<OpenLp>) -> Result<()> {
        require!(
            !ctx.accounts.market.started && !ctx.accounts.market.status.terminal(),
            E::Lifecycle
        );
        let l = &mut ctx.accounts.lp;
        l.market = ctx.accounts.market.key();
        l.owner = ctx.accounts.owner.key();
        l.bump = ctx.bumps.lp;
        Ok(())
    }
    pub fn deposit(ctx: Context<TraderFunds>, amount: u64) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(
            amount > 0
                && !ctx.accounts.config.paused
                && !m
                    .derive_status(&ctx.accounts.parent, &ctx.accounts.target)
                    .terminal(),
            E::Lifecycle
        );
        require!(
            add(add(m.principal, m.lp_deposits)?, amount)? <= ctx.accounts.config.max_deposits,
            E::Math
        );
        let t = &mut ctx.accounts.trader;
        require!(!t.claimed, E::Claimed);
        t.principal = add(t.principal, amount)?;
        t.cash = add(t.cash, amount)?;
        m.principal = add(m.principal, amount)?;
        m.cash = add(m.cash, amount)?;
        token::transfer_checked(
            CpiContext::new(
                token::ID,
                TransferChecked {
                    from: ctx.accounts.user_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            6,
        )
    }
    pub fn fund_lp(ctx: Context<LpFunds>, amount: u64) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(
            amount > 0
                && !m.started
                && !ctx.accounts.config.paused
                && m.derive_status(&ctx.accounts.parent, &ctx.accounts.target) == Status::Funding,
            E::Lifecycle
        );
        require!(
            add(add(m.principal, m.lp_deposits)?, amount)? <= ctx.accounts.config.max_deposits,
            E::Math
        );
        ctx.accounts.lp.deposited = add(ctx.accounts.lp.deposited, amount)?;
        m.lp_deposits = add(m.lp_deposits, amount)?;
        token::transfer_checked(
            CpiContext::new(
                token::ID,
                TransferChecked {
                    from: ctx.accounts.user_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            6,
        )
    }
    pub fn quote(ctx: Context<Quote>, yes: bool, buy: bool, amount: u64) -> Result<u64> {
        let m = &ctx.accounts.market;
        m.trading(
            &ctx.accounts.config,
            &ctx.accounts.parent,
            &ctx.accounts.target,
            Clock::get()?.unix_timestamp,
        )?;
        require!(amount <= ctx.accounts.config.max_trade, E::Math);
        if !buy {
            require!(
                amount
                    <= if yes {
                        ctx.accounts.trader.yes
                    } else {
                        ctx.accounts.trader.no
                    },
                E::Balance
            );
        }
        let y = add(m.yes, m.offset_yes)?;
        let n = add(m.no, m.offset_no)?;
        let cost = math::quote(y, n, m.b, yes, buy, amount)?;
        emit!(QuoteEvent {
            market: m.key(),
            amount,
            cost,
            yes_price_e18: math::price(y, n, m.b)?
        });
        Ok(cost)
    }
    pub fn trade(ctx: Context<Trade>, yes: bool, buy: bool, amount: u64, limit: u64) -> Result<()> {
        let m = &mut ctx.accounts.market;
        m.trading(
            &ctx.accounts.config,
            &ctx.accounts.parent,
            &ctx.accounts.target,
            Clock::get()?.unix_timestamp,
        )?;
        require!(
            amount > 0 && amount <= ctx.accounts.config.max_trade,
            E::Math
        );
        let t = &mut ctx.accounts.trader;
        require!(!t.claimed, E::Claimed);
        let cost = math::quote(
            add(m.yes, m.offset_yes)?,
            add(m.no, m.offset_no)?,
            m.b,
            yes,
            buy,
            amount,
        )?;
        let (held, total) = if yes {
            (&mut t.yes, &mut m.yes)
        } else {
            (&mut t.no, &mut m.no)
        };
        if buy {
            require!(cost <= limit, E::Slippage);
            *held = add(*held, amount)?;
            *total = add(*total, amount)?;
            t.cash = sub(t.cash, cost)?;
            m.cash = sub(m.cash, cost)?;
        } else {
            require!(cost >= limit, E::Slippage);
            *held = sub(*held, amount)?;
            *total = sub(*total, amount)?;
            t.cash = add(t.cash, cost)?;
            m.cash = add(m.cash, cost)?;
        }
        m.reserves_ok()?;
        m.sync(&ctx.accounts.parent, &ctx.accounts.target)?;
        emit!(TradeEvent {
            market: m.key(),
            owner: t.owner,
            yes,
            buy,
            amount,
            cash_flow: cost,
            conditional_cash: t.cash
        });
        Ok(())
    }
    pub fn redeem(ctx: Context<TraderFunds>) -> Result<()> {
        let m = &mut ctx.accounts.market;
        m.sync(&ctx.accounts.parent, &ctx.accounts.target)?;
        require!(m.status.terminal(), E::Locked);
        let t = &mut ctx.accounts.trader;
        require!(!t.claimed, E::Claimed);
        let amount = match m.status {
            Status::Void => t.principal,
            Status::SettledYes => add(t.cash, t.yes)?,
            Status::SettledNo => add(t.cash, t.no)?,
            _ => return err!(E::Locked),
        };
        t.claimed = true;
        m.trader_remaining = sub(m.trader_remaining, amount)?;
        withdraw(
            m,
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.user_token.to_account_info(),
            &ctx.accounts.mint.to_account_info(),
            amount,
        )?;
        emit!(WithdrawalEvent {
            market: m.key(),
            owner: t.owner,
            lp: false,
            amount
        });
        Ok(())
    }
    pub fn withdraw_lp(ctx: Context<LpFunds>, amount: u64) -> Result<()> {
        let m = &mut ctx.accounts.market;
        m.sync(&ctx.accounts.parent, &ctx.accounts.target)?;
        let l = &mut ctx.accounts.lp;
        require!(!l.claimed, E::Claimed);
        let payout;
        if m.status.terminal() {
            payout = if m.status == Status::Void {
                l.deposited
            } else {
                math::prorata(m.lp_pool, l.deposited, m.lp_deposits)?
            };
            require!(amount == payout, E::Balance);
            l.claimed = true;
            l.paid = payout;
            m.lp_remaining = sub(m.lp_remaining, payout)?;
        } else {
            require!(!m.started, E::Locked);
            require!(amount > 0, E::Balance);
            payout = amount;
            l.deposited = sub(l.deposited, payout)?;
            m.lp_deposits = sub(m.lp_deposits, payout)?;
        }
        withdraw(
            m,
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.user_token.to_account_info(),
            &ctx.accounts.mint.to_account_info(),
            payout,
        )?;
        emit!(WithdrawalEvent {
            market: m.key(),
            owner: l.owner,
            lp: true,
            amount: payout
        });
        Ok(())
    }
}
fn withdraw<'info>(
    m: &Account<'info, Market>,
    vault: &AccountInfo<'info>,
    dest: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let bump = [m.bump];
    let seeds: &[&[u8]] = &[
        b"market",
        m.config.as_ref(),
        m.parent.as_ref(),
        m.target.as_ref(),
        &bump,
    ];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token::ID,
            TransferChecked {
                from: vault.clone(),
                mint: mint.clone(),
                to: dest.clone(),
                authority: m.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        6,
    )
}
