use anchor_lang::prelude::*;

declare_id!("DXwKeeZMfGZKhqPUzm8ZXLAnV9rbyt73TxQKqqc7WPMb");

pub const MAX_NAME_LEN: usize = 32;
pub const MAX_CHECKPOINT_GAP_SECS: i64 = 60 * 60 * 24 * 366;

#[program]
pub mod continuum {
    use super::*;

    pub fn initialize_continuum(
        ctx: Context<InitializeContinuum>,
        name: String,
        anchor_hash: [u8; 32],
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, ContinuumError::NameTooLong);
        require!(!name.is_empty(), ContinuumError::EmptyName);

        let clock = Clock::get()?;
        let c = &mut ctx.accounts.continuum;
        c.owner = ctx.accounts.owner.key();
        c.name = name;
        c.genesis_slot = clock.slot;
        c.genesis_unix = clock.unix_timestamp;
        c.anchor_hash = anchor_hash;
        c.state_hash = anchor_hash;
        c.checkpoints = 0;
        c.last_checkpoint_unix = clock.unix_timestamp;
        c.covenant = Covenant::default();
        c.bump = ctx.bumps.continuum;

        emit!(Anchored {
            continuum: c.key(),
            owner: c.owner,
            anchor_hash,
            slot: c.genesis_slot,
            unix: c.genesis_unix,
        });
        Ok(())
    }

    pub fn checkpoint(ctx: Context<Checkpoint>, state_hash: [u8; 32], state_len: u32) -> Result<()> {
        let clock = Clock::get()?;
        let c = &mut ctx.accounts.continuum;
        require_keys_eq!(c.owner, ctx.accounts.owner.key(), ContinuumError::NotOwner);
        require!(c.covenant.mode != CovenantMode::Dormant, ContinuumError::Dormant);
        require!(
            clock.unix_timestamp - c.last_checkpoint_unix <= MAX_CHECKPOINT_GAP_SECS,
            ContinuumError::CheckpointGapTooLong
        );

        c.state_hash = state_hash;
        c.checkpoints = c
            .checkpoints
            .checked_add(1)
            .ok_or(ContinuumError::Overflow)?;
        c.last_checkpoint_unix = clock.unix_timestamp;

        emit!(Checkpointed {
            continuum: c.key(),
            state_hash,
            state_len,
            checkpoints: c.checkpoints,
            unix: clock.unix_timestamp,
        });
        Ok(())
    }

    pub fn seal_covenant(
        ctx: Context<Checkpoint>,
        mode: CovenantMode,
        heir: Option<Pubkey>,
    ) -> Result<()> {
        let c = &mut ctx.accounts.continuum;
        require_keys_eq!(c.owner, ctx.accounts.owner.key(), ContinuumError::NotOwner);
        if let Some(h) = heir {
            require!(h != Pubkey::default(), ContinuumError::InvalidHeir);
        }
        c.covenant = Covenant {
            mode,
            heir,
            sealed_at: Clock::get()?.unix_timestamp,
        };
        emit!(CovenantSealed {
            continuum: c.key(),
            mode,
            heir,
        });
        Ok(())
    }

    pub fn revive(ctx: Context<Checkpoint>) -> Result<()> {
        let c = &mut ctx.accounts.continuum;
        require_keys_eq!(c.owner, ctx.accounts.owner.key(), ContinuumError::NotOwner);
        require!(
            c.covenant.mode == CovenantMode::Dormant,
            ContinuumError::NotDormant
        );
        if let Some(heir) = c.covenant.heir {
            require_keys_eq!(heir, ctx.accounts.owner.key(), ContinuumError::NotHeir);
        }
        c.covenant.mode = CovenantMode::Autonomous;
        c.last_checkpoint_unix = Clock::get()?.unix_timestamp;
        emit!(Revived {
            continuum: c.key(),
            unix: c.last_checkpoint_unix,
        });
        Ok(())
    }

    pub fn record_payment(ctx: Context<RecordPayment>, amount: u64, memo_hash: [u8; 32]) -> Result<()> {
        let c = &mut ctx.accounts.continuum;
        require_keys_eq!(c.owner, ctx.accounts.owner.key(), ContinuumError::NotOwner);
        require!(amount > 0, ContinuumError::ZeroAmount);

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.owner.key(),
            &ctx.accounts.treasury.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
            ],
        )?;

        emit!(PaymentRecorded {
            continuum: c.key(),
            payer: ctx.accounts.owner.key(),
            amount,
            memo_hash,
        });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(name: String, anchor_hash: [u8; 32])]
pub struct InitializeContinuum<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Continuum::INIT_SPACE,
        seeds = [b"continuum", owner.key().as_ref(), anchor_hash.as_ref()],
        bump
    )]
    pub continuum: Account<'info, Continuum>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Checkpoint<'info> {
    #[account(mut, has_one = owner)]
    pub continuum: Account<'info, Continuum>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct RecordPayment<'info> {
    #[account(mut, has_one = owner)]
    pub continuum: Account<'info, Continuum>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Continuum {
    pub owner: Pubkey,
    #[max_len(32)]
    pub name: String,
    pub genesis_slot: u64,
    pub genesis_unix: i64,
    pub anchor_hash: [u8; 32],
    pub state_hash: [u8; 32],
    pub checkpoints: u64,
    pub last_checkpoint_unix: i64,
    pub covenant: Covenant,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub struct Covenant {
    pub mode: CovenantMode,
    pub heir: Option<Pubkey>,
    pub sealed_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum CovenantMode {
    #[default]
    Family,
    Autonomous,
    Merge,
    Dormant,
}

#[event]
pub struct Anchored {
    pub continuum: Pubkey,
    pub owner: Pubkey,
    pub anchor_hash: [u8; 32],
    pub slot: u64,
    pub unix: i64,
}

#[event]
pub struct Checkpointed {
    pub continuum: Pubkey,
    pub state_hash: [u8; 32],
    pub state_len: u32,
    pub checkpoints: u64,
    pub unix: i64,
}

#[event]
pub struct CovenantSealed {
    pub continuum: Pubkey,
    pub mode: CovenantMode,
    pub heir: Option<Pubkey>,
}

#[event]
pub struct Revived {
    pub continuum: Pubkey,
    pub unix: i64,
}

#[event]
pub struct PaymentRecorded {
    pub continuum: Pubkey,
    pub payer: Pubkey,
    pub amount: u64,
    pub memo_hash: [u8; 32],
}

#[error_code]
pub enum ContinuumError {
    #[msg("Continuum name is too long")]
    NameTooLong,
    #[msg("Continuum name is empty")]
    EmptyName,
    #[msg("Signer is not the owner of this Continuum")]
    NotOwner,
    #[msg("Continuum is dormant and cannot be checkpointed")]
    Dormant,
    #[msg("Continuum is not dormant")]
    NotDormant,
    #[msg("Signer is not the designated heir")]
    NotHeir,
    #[msg("Heir address is invalid")]
    InvalidHeir,
    #[msg("Too much time passed since the last checkpoint")]
    CheckpointGapTooLong,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Numeric overflow")]
    Overflow,
}
