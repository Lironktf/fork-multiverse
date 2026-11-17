//! FORK Positions — fully-collateralised conditional claims (DESIGN DRAFT).
//!
//! STATUS: specification-grade source. It has NOT been compiled or deployed
//! from this repository (no Rust/Anchor toolchain was available in the build
//! environment). The FORK UI labels the feature "not deployed" and never
//! simulates a position. See programs/fork_positions/README.md.
//!
//! Model: one precisely defined binary event per `Market`. Depositing N units
//! of the collateral mint creates a complete set — N YES + N NO claims — so
//! every claim is always 100% backed. Before resolution a complete set can be
//! merged back into collateral. Claims can be transferred between wallets.
//! A named resolution authority (a test key on devnet) posts the outcome after
//! expiry; the winning side then redeems 1:1. No model, oracle or LLM ever
//! decides a payout.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("ForkPos1111111111111111111111111111111111111");

#[program]
pub mod fork_positions {
    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, event_hash: [u8; 32], expiry_ts: i64) -> Result<()> {
        require!(expiry_ts > Clock::get()?.unix_timestamp, ForkError::ExpiryInPast);
        let m = &mut ctx.accounts.market;
        m.creator = ctx.accounts.creator.key();
        m.resolution_authority = ctx.accounts.resolution_authority.key();
        m.collateral_mint = ctx.accounts.collateral_mint.key();
        m.vault = ctx.accounts.vault.key();
        m.event_hash = event_hash; // sha256 of the canonical event definition (title + resolution criteria + source id)
        m.expiry_ts = expiry_ts;
        m.outcome = Outcome::Unresolved;
        m.total_sets = 0;
        m.bump = ctx.bumps.market;
        Ok(())
    }

    /// Deposit `amount` collateral; credit `amount` YES and `amount` NO.
    pub fn mint_set(ctx: Context<MoveCollateral>, amount: u64) -> Result<()> {
        require!(amount > 0, ForkError::ZeroAmount);
        require!(ctx.accounts.market.outcome == Outcome::Unresolved, ForkError::AlreadyResolved);
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer { from: ctx.accounts.user_token.to_account_info(), to: ctx.accounts.vault.to_account_info(), authority: ctx.accounts.owner.to_account_info() },
            ),
            amount,
        )?;
        let p = &mut ctx.accounts.position;
        p.market = ctx.accounts.market.key();
        p.owner = ctx.accounts.owner.key();
        p.yes = p.yes.checked_add(amount).ok_or(ForkError::Overflow)?;
        p.no = p.no.checked_add(amount).ok_or(ForkError::Overflow)?;
        ctx.accounts.market.total_sets = ctx.accounts.market.total_sets.checked_add(amount).ok_or(ForkError::Overflow)?;
        Ok(())
    }

    /// Burn `amount` YES + `amount` NO; return `amount` collateral (pre-resolution only).
    pub fn merge_set(ctx: Context<MoveCollateral>, amount: u64) -> Result<()> {
        require!(ctx.accounts.market.outcome == Outcome::Unresolved, ForkError::AlreadyResolved);
        let p = &mut ctx.accounts.position;
        require!(p.yes >= amount && p.no >= amount, ForkError::InsufficientClaims);
        p.yes -= amount;
        p.no -= amount;
        ctx.accounts.market.total_sets -= amount;
        pay_out(&ctx, amount)
    }

    /// Move claims of one side to another wallet's position.
    pub fn transfer_claim(ctx: Context<TransferClaim>, side: Side, amount: u64) -> Result<()> {
        require!(ctx.accounts.market.outcome == Outcome::Unresolved, ForkError::AlreadyResolved);
        let from = &mut ctx.accounts.from_position;
        let to = &mut ctx.accounts.to_position;
        to.market = ctx.accounts.market.key();
        to.owner = ctx.accounts.recipient.key();
        match side {
            Side::Yes => {
                require!(from.yes >= amount, ForkError::InsufficientClaims);
                from.yes -= amount;
                to.yes = to.yes.checked_add(amount).ok_or(ForkError::Overflow)?;
            }
            Side::No => {
                require!(from.no >= amount, ForkError::InsufficientClaims);
                from.no -= amount;
                to.no = to.no.checked_add(amount).ok_or(ForkError::Overflow)?;
            }
        }
        Ok(())
    }

    /// Only the named authority, only after expiry, only once.
    pub fn resolve(ctx: Context<Resolve>, yes_won: bool) -> Result<()> {
        let m = &mut ctx.accounts.market;
        require!(m.outcome == Outcome::Unresolved, ForkError::AlreadyResolved);
        require!(Clock::get()?.unix_timestamp >= m.expiry_ts, ForkError::NotExpired);
        m.outcome = if yes_won { Outcome::Yes } else { Outcome::No };
        Ok(())
    }

    /// Winning claims redeem 1:1 for collateral.
    pub fn redeem(ctx: Context<MoveCollateral>) -> Result<()> {
        let outcome = ctx.accounts.market.outcome;
        let p = &mut ctx.accounts.position;
        let amount = match outcome {
            Outcome::Yes => std::mem::take(&mut p.yes),
            Outcome::No => std::mem::take(&mut p.no),
            Outcome::Unresolved => return err!(ForkError::NotResolved),
        };
        require!(amount > 0, ForkError::ZeroAmount);
        pay_out(&ctx, amount)
    }
}

fn pay_out(ctx: &Context<MoveCollateral>, amount: u64) -> Result<()> {
    let m = &ctx.accounts.market;
    let seeds: &[&[u8]] = &[b"market", m.creator.as_ref(), m.event_hash.as_ref(), &[m.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer { from: ctx.accounts.vault.to_account_info(), to: ctx.accounts.user_token.to_account_info(), authority: ctx.accounts.market.to_account_info() },
            &[seeds],
        ),
        amount,
    )
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
    pub resolution_authority: Pubkey,
    pub collateral_mint: Pubkey,
    pub vault: Pubkey,
    pub event_hash: [u8; 32],
    pub expiry_ts: i64,
    pub outcome: Outcome,
    pub total_sets: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub yes: u64,
    pub no: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Outcome {
    Unresolved,
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum Side {
    Yes,
    No,
}

#[derive(Accounts)]
#[instruction(event_hash: [u8; 32])]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    /// CHECK: stored as the sole key allowed to call `resolve`.
    pub resolution_authority: UncheckedAccount<'info>,
    pub collateral_mint: Account<'info, Mint>,
    #[account(init, payer = creator, space = 8 + Market::INIT_SPACE, seeds = [b"market", creator.key().as_ref(), event_hash.as_ref()], bump)]
    pub market: Account<'info, Market>,
    #[account(init, payer = creator, token::mint = collateral_mint, token::authority = market, seeds = [b"vault", market.key().as_ref()], bump)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MoveCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, has_one = vault)]
    pub market: Account<'info, Market>,
    #[account(init_if_needed, payer = owner, space = 8 + Position::INIT_SPACE, seeds = [b"position", market.key().as_ref(), owner.key().as_ref()], bump)]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = market.collateral_mint, token::authority = owner)]
    pub user_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferClaim<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: recipient wallet; only used as a PDA seed and stored owner.
    pub recipient: UncheckedAccount<'info>,
    pub market: Account<'info, Market>,
    #[account(mut, seeds = [b"position", market.key().as_ref(), owner.key().as_ref()], bump, has_one = owner)]
    pub from_position: Account<'info, Position>,
    #[account(init_if_needed, payer = owner, space = 8 + Position::INIT_SPACE, seeds = [b"position", market.key().as_ref(), recipient.key().as_ref()], bump)]
    pub to_position: Account<'info, Position>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Resolve<'info> {
    pub resolution_authority: Signer<'info>,
    #[account(mut, has_one = resolution_authority)]
    pub market: Account<'info, Market>,
}

#[error_code]
pub enum ForkError {
    #[msg("Expiry must be in the future")]
    ExpiryInPast,
    #[msg("Amount must be positive")]
    ZeroAmount,
    #[msg("Market already resolved")]
    AlreadyResolved,
    #[msg("Market not yet resolved")]
    NotResolved,
    #[msg("Market has not expired")]
    NotExpired,
    #[msg("Not enough claims")]
    InsufficientClaims,
    #[msg("Arithmetic overflow")]
    Overflow,
}
