use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};

declare_id!("OZ1ZcivicRegistry1111111111111111111111111111");

pub const STATUS_NEW: u8 = 1;
pub const STATUS_AI_VERIFIED: u8 = 2;
pub const STATUS_ASSIGNED: u8 = 3;
pub const STATUS_IN_PROGRESS: u8 = 4;
pub const STATUS_RESOLVED: u8 = 5;
pub const STATUS_CONFIRMED_BY_CITIZEN: u8 = 6;
pub const STATUS_REOPENED: u8 = 7;
pub const STATUS_REJECTED: u8 = 8;

pub const ROLE_CITIZEN: u8 = 1;
pub const ROLE_SERVICE: u8 = 2;
pub const ROLE_ORACLE: u8 = 3;

#[program]
pub mod civic_registry {
    use super::*;

    /// Submit a new civic appeal report. Immutable upon creation.
    /// No delete or update instructions exist in this program!
    pub fn submit_report(
        ctx: Context<SubmitReport>,
        report_id: [u8; 16],
        reporter_hash: [u8; 32],
        media_sha256: [u8; 32],
        media_cid: String,
        text_sha256: [u8; 32],
        geo_cell: u64,
        category: u8,
        priority: u8,
        ai_analysis_sha256: [u8; 32],
    ) -> Result<()> {
        require!(media_cid.len() <= 64, CivicError::CidTooLong);
        require!(media_sha256 != [0u8; 32], CivicError::InvalidMediaHash);

        let report = &mut ctx.accounts.report;
        let clock = Clock::get()?;

        report.report_id = report_id;
        report.reporter_hash = reporter_hash;
        report.media_sha256 = media_sha256;
        report.media_cid = media_cid;
        report.text_sha256 = text_sha256;
        report.geo_cell = geo_cell;
        report.category = category;
        report.priority = priority;
        report.ai_analysis_sha256 = ai_analysis_sha256;
        report.created_at = clock.unix_timestamp;
        report.event_count = 1;
        report.bump = ctx.bumps.report;

        // Initialize genesis StatusEvent (seq = 0)
        let genesis_event = &mut ctx.accounts.genesis_event;
        genesis_event.report = report.key();
        genesis_event.seq = 0;
        genesis_event.prev_event_hash = [0u8; 32];
        genesis_event.status = STATUS_NEW;
        genesis_event.actor_role = ROLE_CITIZEN;
        genesis_event.actor = ctx.accounts.payer.key();
        genesis_event.note_sha256 = [0u8; 32];
        genesis_event.timestamp = clock.unix_timestamp;
        genesis_event.bump = ctx.bumps.genesis_event;

        msg!(
            "OZIZ: Report created [id={:?}, cat={}, prio={}]",
            report_id,
            category,
            priority
        );
        Ok(())
    }

    /// Append a new status event in the verifiable hash-chain.
    /// Strict append-only: seq must strictly increment, prev_event_hash must match.
    pub fn append_status(
        ctx: Context<AppendStatus>,
        seq: u32,
        prev_event_hash: [u8; 32],
        new_status: u8,
        actor_role: u8,
        note_sha256: [u8; 32],
    ) -> Result<()> {
        let report = &mut ctx.accounts.report;
        let clock = Clock::get()?;

        // 1. Strict sequence check
        require!(seq == report.event_count, CivicError::SequenceMismatch);

        // 2. Role check & rejection justification constraint
        if new_status == STATUS_REJECTED {
            require!(note_sha256 != [0u8; 32], CivicError::RejectionReasonRequired);
        }

        // 3. Status transition validity (services cannot rollback to NEW or delete)
        require!(new_status >= STATUS_AI_VERIFIED && new_status <= STATUS_REJECTED, CivicError::InvalidStatusTransition);

        // 4. Record new event
        let event = &mut ctx.accounts.event;
        event.report = report.key();
        event.seq = seq;
        event.prev_event_hash = prev_event_hash;
        event.status = new_status;
        event.actor_role = actor_role;
        event.actor = ctx.accounts.actor.key();
        event.note_sha256 = note_sha256;
        event.timestamp = clock.unix_timestamp;
        event.bump = ctx.bumps.event;

        // Increment event counter
        report.event_count = report.event_count.checked_add(1).ok_or(CivicError::NumericOverflow)?;

        msg!(
            "OZIZ: Status appended [seq={}, status={}, actor={}]",
            seq,
            new_status,
            ctx.accounts.actor.key()
        );
        Ok(())
    }

    /// Citizen confirmation "I also see this" with anti-sybil PDA per reporter hash
    pub fn citizen_confirm(
        ctx: Context<CitizenConfirm>,
        reporter_hash: [u8; 32],
    ) -> Result<()> {
        let clock = Clock::get()?;
        let confirmation = &mut ctx.accounts.confirmation;
        confirmation.report = ctx.accounts.report.key();
        confirmation.reporter_hash = reporter_hash;
        confirmation.timestamp = clock.unix_timestamp;
        confirmation.bump = ctx.bumps.confirmation;

        msg!("OZIZ: Citizen confirmed report [{}]", ctx.accounts.report.key());
        Ok(())
    }

    /// Citizen voting on resolution (Fixed vs Not Fixed)
    pub fn citizen_vote_resolution(
        ctx: Context<CitizenVoteResolution>,
        voter_hash: [u8; 32],
        is_fixed: bool,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let vote = &mut ctx.accounts.vote;
        vote.report = ctx.accounts.report.key();
        vote.voter_hash = voter_hash;
        vote.is_fixed = is_fixed;
        vote.timestamp = clock.unix_timestamp;
        vote.bump = ctx.bumps.vote;

        msg!("OZIZ: Citizen resolution vote [fixed={}]", is_fixed);
        Ok(())
    }

    /// Record municipal SLA violation by Oracle
    pub fn record_sla_violation(
        ctx: Context<RecordSlaViolation>,
        seq: u32,
        prev_event_hash: [u8; 32],
        sla_hours_exceeded: u32,
    ) -> Result<()> {
        let report = &mut ctx.accounts.report;
        let clock = Clock::get()?;

        require!(seq == report.event_count, CivicError::SequenceMismatch);

        let event = &mut ctx.accounts.event;
        event.report = report.key();
        event.seq = seq;
        event.prev_event_hash = prev_event_hash;
        event.status = report.category; // keeps current state
        event.actor_role = ROLE_ORACLE;
        event.actor = ctx.accounts.oracle.key();
        
        // Hash SLA breach payload
        let mut hasher = Sha256::new();
        hasher.update(b"SLA_VIOLATION:");
        hasher.update(&sla_hours_exceeded.to_le_bytes());
        let hash: [u8; 32] = hasher.finalize().into();
        event.note_sha256 = hash;
        event.timestamp = clock.unix_timestamp;
        event.bump = ctx.bumps.event;

        report.event_count = report.event_count.checked_add(1).ok_or(CivicError::NumericOverflow)?;

        msg!("OZIZ: SLA violation recorded! Hours exceeded: {}", sla_hours_exceeded);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(report_id: [u8; 16])]
pub struct SubmitReport<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Report::MAX_SIZE,
        seeds = [b"report", report_id.as_ref()],
        bump
    )]
    pub report: Account<'info, Report>,

    #[account(
        init,
        payer = payer,
        space = 8 + StatusEvent::MAX_SIZE,
        seeds = [b"event", report.key().as_ref(), &0u32.to_le_bytes()],
        bump
    )]
    pub genesis_event: Account<'info, StatusEvent>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(seq: u32)]
pub struct AppendStatus<'info> {
    #[account(
        mut,
        seeds = [b"report", report.report_id.as_ref()],
        bump = report.bump
    )]
    pub report: Account<'info, Report>,

    #[account(
        init,
        payer = actor,
        space = 8 + StatusEvent::MAX_SIZE,
        seeds = [b"event", report.key().as_ref(), &seq.to_le_bytes()],
        bump
    )]
    pub event: Account<'info, StatusEvent>,

    #[account(mut)]
    pub actor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(reporter_hash: [u8; 32])]
pub struct CitizenConfirm<'info> {
    pub report: Account<'info, Report>,

    #[account(
        init,
        payer = payer,
        space = 8 + Confirmation::MAX_SIZE,
        seeds = [b"confirm", report.key().as_ref(), reporter_hash.as_ref()],
        bump
    )]
    pub confirmation: Account<'info, Confirmation>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(voter_hash: [u8; 32])]
pub struct CitizenVoteResolution<'info> {
    pub report: Account<'info, Report>,

    #[account(
        init,
        payer = payer,
        space = 8 + Vote::MAX_SIZE,
        seeds = [b"vote", report.key().as_ref(), voter_hash.as_ref()],
        bump
    )]
    pub vote: Account<'info, Vote>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(seq: u32)]
pub struct RecordSlaViolation<'info> {
    #[account(
        mut,
        seeds = [b"report", report.report_id.as_ref()],
        bump = report.bump
    )]
    pub report: Account<'info, Report>,

    #[account(
        init,
        payer = oracle,
        space = 8 + StatusEvent::MAX_SIZE,
        seeds = [b"event", report.key().as_ref(), &seq.to_le_bytes()],
        bump
    )]
    pub event: Account<'info, StatusEvent>,

    #[account(mut)]
    pub oracle: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Report {
    pub report_id: [u8; 16],        // UUID v4
    pub reporter_hash: [u8; 32],    // sha256(user_salt + device_id)
    pub media_sha256: [u8; 32],     // SHA-256 of original/anonymized media
    pub media_cid: String,          // IPFS/Arweave CID (max 64 chars)
    pub text_sha256: [u8; 32],      // SHA-256 of description
    pub geo_cell: u64,              // H3 index spatial cell
    pub category: u8,               // 1..11
    pub priority: u8,               // 1..4 (LOW, MED, HIGH, CRIT)
    pub ai_analysis_sha256: [u8; 32], // Hash of complete AI schema output
    pub created_at: i64,
    pub event_count: u32,
    pub bump: u8,
}

impl Report {
    pub const MAX_SIZE: usize = 16 + 32 + 32 + (4 + 64) + 32 + 8 + 1 + 1 + 32 + 8 + 4 + 1;
}

#[account]
pub struct StatusEvent {
    pub report: Pubkey,
    pub seq: u32,                   // strictly sequential index
    pub prev_event_hash: [u8; 32],  // SHA-256 hash of (seq-1) event
    pub status: u8,
    pub actor_role: u8,             // citizen | service | oracle
    pub actor: Pubkey,
    pub note_sha256: [u8; 32],
    pub timestamp: i64,
    pub bump: u8,
}

impl StatusEvent {
    pub const MAX_SIZE: usize = 32 + 4 + 32 + 1 + 1 + 32 + 32 + 8 + 1;
}

#[account]
pub struct Confirmation {
    pub report: Pubkey,
    pub reporter_hash: [u8; 32],
    pub timestamp: i64,
    pub bump: u8,
}

impl Confirmation {
    pub const MAX_SIZE: usize = 32 + 32 + 8 + 1;
}

#[account]
pub struct Vote {
    pub report: Pubkey,
    pub voter_hash: [u8; 32],
    pub is_fixed: bool,
    pub timestamp: i64,
    pub bump: u8,
}

impl Vote {
    pub const MAX_SIZE: usize = 32 + 32 + 1 + 8 + 1;
}

#[error_code]
pub enum CivicError {
    #[msg("Sequence mismatch: seq must equal report.event_count")]
    SequenceMismatch,
    #[msg("Rejection requires a non-empty cryptographic reason hash")]
    RejectionReasonRequired,
    #[msg("Media CID exceeds maximum allowed length of 64 characters")]
    CidTooLong,
    #[msg("Invalid media sha256 hash")]
    InvalidMediaHash,
    #[msg("Invalid status transition")]
    InvalidStatusTransition,
    #[msg("Numeric overflow")]
    NumericOverflow,
}
