use crate::{error::MarketError as E, state::*};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct MigrateMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Owner checked here; discriminator, exact V1/V2 size and canonical
    /// market PDA checked in the handler before any resize or write.
    #[account(mut, owner = crate::ID)]
    pub market: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config", admin.key().as_ref()],
        bump,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        constraint = mint.decimals == 6 @ E::Binding,
        constraint = mint.freeze_authority.is_none() @ E::Binding,
    )]
    pub mint: Box<Account<'info, Mint>>,
    pub system_program: Program<'info, System>,
}

/// Native SOL is the only collateral allowed in the current application.
#[derive(Accounts)]
pub struct InitializeSolConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE,
        seeds = [b"config-sol", admin.key().as_ref()], bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(address = anchor_spl::token::spl_token::native_mint::ID @ E::Binding,
        constraint = mint.decimals == 9 @ E::Binding,
        constraint = mint.mint_authority.is_none() @ E::Binding,
        constraint = mint.freeze_authority.is_none() @ E::Binding)]
    pub mint: Box<Account<'info, Mint>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Administer<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [config.seed(), config.creator.as_ref()],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,
}

#[derive(Accounts)]
#[instruction(binding: [u8; 32])]
pub struct RegisterEvent<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [config.seed(), config.creator.as_ref()],
        bump = config.bump,
        has_one = admin,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        init,
        payer = admin,
        space = 8 + ExternalEvent::INIT_SPACE,
        seeds = [b"event", config.key().as_ref(), &binding],
        bump,
    )]
    pub event: Box<Account<'info, ExternalEvent>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Report<'info> {
    pub reporter: Signer<'info>,
    #[account(
        seeds = [config.seed(), config.creator.as_ref()],
        bump = config.bump,
        has_one = reporter @ E::Unauthorized,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        has_one = config,
        seeds = [b"event", config.key().as_ref(), &event.binding],
        bump = event.bump,
    )]
    pub event: Box<Account<'info, ExternalEvent>>,
}

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [config.seed(), config.creator.as_ref()],
        bump = config.bump,
        has_one = admin,
        has_one = mint,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(has_one = config)]
    pub parent: Box<Account<'info, ExternalEvent>>,
    #[account(
        has_one = config,
        constraint = target.key() != parent.key() @ E::Binding,
    )]
    pub target: Box<Account<'info, ExternalEvent>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", config.key().as_ref(), parent.key().as_ref(), target.key().as_ref()],
        bump,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        init,
        payer = admin,
        seeds = [b"vault", market.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = market,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SyncMarket<'info> {
    #[account(
        seeds = [config.seed(), config.creator.as_ref()],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        has_one = config,
        has_one = parent,
        has_one = target,
        seeds = [b"market", config.key().as_ref(), parent.key().as_ref(), target.key().as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(has_one = config)]
    pub parent: Box<Account<'info, ExternalEvent>>,
    #[account(has_one = config)]
    pub target: Box<Account<'info, ExternalEvent>>,
}

#[derive(Accounts)]
pub struct OpenTrader<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    #[account(
        init,
        payer = owner,
        space = 8 + Trader::INIT_SPACE,
        seeds = [b"trader", market.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub trader: Box<Account<'info, Trader>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OpenLp<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub market: Box<Account<'info, Market>>,
    #[account(
        init,
        payer = owner,
        space = 8 + Lp::INIT_SPACE,
        seeds = [b"lp", market.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub lp: Box<Account<'info, Lp>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Trade<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [config.seed(), config.creator.as_ref()],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        has_one = config,
        has_one = parent,
        has_one = target,
        seeds = [b"market", config.key().as_ref(), parent.key().as_ref(), target.key().as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(has_one = config)]
    pub parent: Box<Account<'info, ExternalEvent>>,
    #[account(has_one = config)]
    pub target: Box<Account<'info, ExternalEvent>>,
    #[account(
        mut,
        has_one = market,
        has_one = owner,
        seeds = [b"trader", market.key().as_ref(), owner.key().as_ref()],
        bump = trader.bump,
    )]
    pub trader: Box<Account<'info, Trader>>,
}

#[derive(Accounts)]
pub struct TraderFunds<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [config.seed(), config.creator.as_ref()],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        has_one = config,
        has_one = parent,
        has_one = target,
        has_one = vault,
        has_one = mint,
        seeds = [b"market", config.key().as_ref(), parent.key().as_ref(), target.key().as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(has_one = config)]
    pub parent: Box<Account<'info, ExternalEvent>>,
    #[account(has_one = config)]
    pub target: Box<Account<'info, ExternalEvent>>,
    #[account(
        mut,
        has_one = market,
        has_one = owner,
        seeds = [b"trader", market.key().as_ref(), owner.key().as_ref()],
        bump = trader.bump,
    )]
    pub trader: Box<Account<'info, Trader>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = market,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
    )]
    pub user_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct LpFunds<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [config.seed(), config.creator.as_ref()],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        has_one = config,
        has_one = parent,
        has_one = target,
        has_one = vault,
        has_one = mint,
        seeds = [b"market", config.key().as_ref(), parent.key().as_ref(), target.key().as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(has_one = config)]
    pub parent: Box<Account<'info, ExternalEvent>>,
    #[account(has_one = config)]
    pub target: Box<Account<'info, ExternalEvent>>,
    #[account(
        mut,
        has_one = market,
        has_one = owner,
        seeds = [b"lp", market.key().as_ref(), owner.key().as_ref()],
        bump = lp.bump,
    )]
    pub lp: Box<Account<'info, Lp>>,
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = market,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = owner,
    )]
    pub user_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Quote<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [config.seed(), config.creator.as_ref()],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(
        has_one = config,
        has_one = parent,
        has_one = target,
        seeds = [b"market", config.key().as_ref(), parent.key().as_ref(), target.key().as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(has_one = config)]
    pub parent: Box<Account<'info, ExternalEvent>>,
    #[account(has_one = config)]
    pub target: Box<Account<'info, ExternalEvent>>,
    #[account(
        has_one = market,
        has_one = owner,
        seeds = [b"trader", market.key().as_ref(), owner.key().as_ref()],
        bump = trader.bump,
    )]
    pub trader: Box<Account<'info, Trader>>,
}
