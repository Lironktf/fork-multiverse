use crate::{error::MarketError as E, math};
use anchor_lang::prelude::*;
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub creator: Pubkey,
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    pub reporter: Pubkey,
    pub pause_authority: Pubkey,
    pub mint: Pubkey,
    pub max_trade: u64,
    pub max_deposits: u64,
    pub fee_bps: u16,
    pub paused: bool,
    pub bump: u8,
}

impl Config {
    /// Separate native-SOL configurations from legacy six-decimal collateral.
    /// The immutable mint determines the seed; legacy accounts remain redeemable.
    pub fn seed(&self) -> &'static [u8] {
        if self.mint == anchor_spl::token::spl_token::native_mint::ID {
            b"config-sol"
        } else {
            b"config"
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Outcome {
    Unresolved,
    Yes,
    No,
    Invalid,
}

#[account]
#[derive(InitSpace)]
pub struct ExternalEvent {
    pub config: Pubkey,
    pub binding: [u8; 32],
    #[max_len(64)]
    pub ticker: String,
    #[max_len(96)]
    pub instrument: String,
    pub terms_hash: [u8; 32],
    pub close_ts: i64,
    pub observation_ts: i64,
    pub registered_ts: i64,
    pub outcome: Outcome,
    pub halted: bool,
    pub source_ts: i64,
    pub submitted_ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Status {
    Funding,
    Pending,
    Active,
    Frozen,
    Halted,
    SettledYes,
    SettledNo,
    Void,
}
impl Status {
    pub fn terminal(self) -> bool {
        matches!(self, Self::SettledYes | Self::SettledNo | Self::Void)
    }
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub config: Pubkey,
    pub parent: Pubkey,
    pub target: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub b: u64,
    pub offset_yes: u64,
    pub offset_no: u64,
    pub yes: u64,
    pub no: u64,
    pub principal: u64,
    pub cash: u64,
    pub lp_deposits: u64,
    pub lp_pool: u64,
    pub trader_remaining: u64,
    pub lp_remaining: u64,
    pub started: bool,
    pub status: Status,
    pub bump: u8,
    // Append only. migrate_market extends V1 accounts with zero-fee terms.
    pub fee_bps: u16,
    /// Conditional fees: embedded in LP residual on valid settlement; canceled on VOID.
    pub fees_accrued: u64,
}
impl Market {
    pub fn required_subsidy(&self) -> Result<u64> {
        math::add(
            math::potential(self.offset_yes, self.offset_no, self.b)?,
            math::ROUNDING,
        )
    }
    pub fn reserves_ok(&self) -> Result<()> {
        let assets = math::add(self.lp_deposits, self.principal)?;
        require!(
            assets >= math::add(self.cash, self.yes.max(self.no))?,
            E::Insolvent
        );
        Ok(())
    }
    pub fn derive_status(&self, a: &ExternalEvent, b: &ExternalEvent) -> Status {
        if self.status.terminal() {
            return self.status;
        }
        if a.outcome == Outcome::No
            || a.outcome == Outcome::Invalid
            || b.outcome == Outcome::Invalid
        {
            return Status::Void;
        }
        if a.outcome == Outcome::Yes {
            match b.outcome {
                Outcome::Yes => return Status::SettledYes,
                Outcome::No => return Status::SettledNo,
                _ => {}
            }
        }
        if a.halted || b.halted {
            return Status::Halted;
        }
        if b.outcome != Outcome::Unresolved {
            return Status::Frozen;
        }
        if !self.started {
            return Status::Funding;
        }
        if a.outcome == Outcome::Yes {
            Status::Active
        } else {
            Status::Pending
        }
    }
    pub fn sync(&mut self, a: &ExternalEvent, b: &ExternalEvent) -> Result<()> {
        if self.status.terminal() {
            return Ok(());
        }
        let next = self.derive_status(a, b);
        if next.terminal() {
            self.trader_remaining = match next {
                Status::Void => self.principal,
                Status::SettledYes => math::add(self.cash, self.yes)?,
                Status::SettledNo => math::add(self.cash, self.no)?,
                _ => unreachable!(),
            };
            self.lp_pool = math::sub(
                math::add(self.lp_deposits, self.principal)?,
                self.trader_remaining,
            )?;
            self.lp_remaining = self.lp_pool;
        }
        self.status = next;
        Ok(())
    }
    pub fn trading(
        &self,
        c: &Config,
        a: &ExternalEvent,
        b: &ExternalEvent,
        now: i64,
    ) -> Result<()> {
        let status = self.derive_status(a, b);
        require!(
            !c.paused && self.started && matches!(status, Status::Pending | Status::Active),
            E::NotTrading
        );
        require!(
            now < b.close_ts && (a.outcome == Outcome::Yes || now < a.close_ts),
            E::NotTrading
        );
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Trader {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub principal: u64,
    pub cash: u64,
    pub yes: u64,
    pub no: u64,
    pub claimed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Lp {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub deposited: u64,
    pub paid: u64,
    pub claimed: bool,
    pub bump: u8,
}

#[event]
pub struct TradeEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub yes: bool,
    pub buy: bool,
    pub amount: u64,
    pub cash_flow: u64,
    pub conditional_cash: u64,
    pub fee: u64,
}

#[event]
pub struct ResolutionEvent {
    pub event: Pubkey,
    pub outcome: Outcome,
    pub halted: bool,
    pub source_ts: i64,
}

#[event]
pub struct LifecycleEvent {
    pub market: Pubkey,
    pub status: Status,
    pub trader_liability: u64,
    pub lp_equity: u64,
}

#[event]
pub struct WithdrawalEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub lp: bool,
    pub amount: u64,
}

#[event]
pub struct QuoteEvent {
    pub market: Pubkey,
    pub amount: u64,
    pub cost: u64,
    pub yes_price_e18: u64,
    pub fee: u64,
}
