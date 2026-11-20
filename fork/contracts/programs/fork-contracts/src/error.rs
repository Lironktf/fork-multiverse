use anchor_lang::prelude::*;
#[error_code]
pub enum MarketError {
    #[msg("Arithmetic overflow or unsupported numeric range")]
    Math,
    #[msg("Unauthorized authority or reporter")]
    Unauthorized,
    #[msg("Invalid immutable binding or configuration")]
    Binding,
    #[msg("Trading is paused, closed, frozen or not started")]
    NotTrading,
    #[msg("Invalid lifecycle transition")]
    Lifecycle,
    #[msg("Insufficient conditional cash or holdings")]
    Balance,
    #[msg("Slippage limit exceeded")]
    Slippage,
    #[msg("Reserves do not cover all outcomes")]
    Insolvent,
    #[msg("Withdrawal is locked until terminal settlement")]
    Locked,
    #[msg("Already redeemed")]
    Claimed,
    #[msg("Conflicting final report")]
    Conflict,
    #[msg("Stale or invalid source timestamp")]
    Timestamp,
}
