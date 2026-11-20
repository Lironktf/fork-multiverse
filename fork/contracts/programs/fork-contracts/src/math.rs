//! Stable LMSR with a common integer potential. All amounts are micro-units.
use crate::error::MarketError as E;
use anchor_lang::prelude::*;
pub const SCALE: u128 = 1_000_000_000_000_000_000;
pub const LN2: u128 = 693_147_180_559_945_309;
pub const MAX_B: u64 = 1_000_000_000_000;
pub const MAX_Q: u64 = 1_000_000_000_000_000;
pub const ROUNDING: u64 = 4;
/// Maximum fee on the collateral value of a trade, snapshotted at creation.
pub const MAX_FEE_BPS: u16 = 1_000;

/// Round up so splitting a trade cannot erase its fee. Zero proceeds have zero fee.
pub fn trade_fee(gross: u64, fee_bps: u16) -> Result<u64> {
    require!(fee_bps <= MAX_FEE_BPS, E::Math);
    narrow(plus(mul(gross as u128, fee_bps as u128)?, 9_999)? / 10_000)
}

pub fn with_fee(gross: u64, fee_bps: u16, buy: bool) -> Result<(u64, u64)> {
    let fee = trade_fee(gross, fee_bps)?;
    Ok((
        if buy {
            add(gross, fee)?
        } else {
            sub(gross, fee)?
        },
        fee,
    ))
}

pub fn initial_offset(b: u64, log_odds_e6: i64) -> Result<u64> {
    require!(log_odds_e6.unsigned_abs() <= 16_000_000, E::Math);
    narrow(mul(b as u128, log_odds_e6.unsigned_abs() as u128)? / 1_000_000)
}

/// Conservative depth for a fixed budget and initial probability. At MAX_B the
/// offset is exact; +2 covers flooring/series error (<1.02 micro-units).
/// A final exact subsidy check is mandatory, independently of this estimate.
pub fn depth_for_budget(budget: u64, log_odds_e6: i64) -> Result<u64> {
    let slope = add(potential(initial_offset(MAX_B, log_odds_e6)?, 0, MAX_B)?, 2)?;
    let b = narrow(mul(sub(budget, ROUNDING)? as u128, MAX_B as u128)? / slope as u128)?.min(MAX_B);
    let required = add(potential(initial_offset(b, log_odds_e6)?, 0, b)?, ROUNDING)?;
    require!(required <= budget, E::Insolvent);
    Ok(b)
}
pub fn add(a: u64, b: u64) -> Result<u64> {
    a.checked_add(b).ok_or_else(|| error!(E::Math))
}
pub fn sub(a: u64, b: u64) -> Result<u64> {
    a.checked_sub(b).ok_or_else(|| error!(E::Balance))
}
fn mul(a: u128, b: u128) -> Result<u128> {
    a.checked_mul(b).ok_or_else(|| error!(E::Math))
}
fn plus(a: u128, b: u128) -> Result<u128> {
    a.checked_add(b).ok_or_else(|| error!(E::Math))
}
fn narrow(x: u128) -> Result<u64> {
    u64::try_from(x).map_err(|_| error!(E::Math))
}
/// exp(-x), x in SCALE units; tail >=42 is below 0.000001 micro-unit at MAX_B.
pub fn exp_neg(x: u128) -> Result<u128> {
    if x >= 42 * SCALE {
        return Ok(0);
    }
    let k = x / LN2;
    let r = x % LN2;
    let mut term = SCALE;
    let mut sum = SCALE;
    for i in 1..=24u128 {
        term = mul(term, r)? / SCALE / i;
        sum = plus(sum, term)?;
    }
    Ok((mul(SCALE, SCALE)? / sum) >> k)
}
/// ln(1+e) = 2 atanh(e/(2+e)), e in [0,1].
fn log_one_plus(e: u128) -> Result<u128> {
    let z = mul(e, SCALE)? / plus(2 * SCALE, e)?;
    let z2 = mul(z, z)? / SCALE;
    let mut power = z;
    let mut sum = 0;
    for i in 0..40u128 {
        sum = plus(sum, power / (2 * i + 1))?;
        power = mul(power, z2)? / SCALE;
    }
    mul(sum, 2)
}
pub fn potential(y: u64, n: u64, b: u64) -> Result<u64> {
    require!(
        (1_000_000..=MAX_B).contains(&b) && y <= MAX_Q && n <= MAX_Q,
        E::Math
    );
    let x = mul(y.abs_diff(n) as u128, SCALE)? / b as u128;
    add(
        y.max(n),
        narrow(mul(b as u128, log_one_plus(exp_neg(x)?)?)? / SCALE)?,
    )
}
pub fn price(y: u64, n: u64, b: u64) -> Result<u64> {
    potential(y, n, b)?;
    let e = exp_neg(mul(y.abs_diff(n) as u128, SCALE)? / b as u128)?;
    let high = mul(SCALE, SCALE)? / plus(SCALE, e)?;
    narrow(if y >= n { high } else { SCALE - high })
}
pub fn quote(y: u64, n: u64, b: u64, yes: bool, buy: bool, amount: u64) -> Result<u64> {
    require!(amount > 0, E::Math);
    let before = potential(y, n, b)?;
    let old = if yes { y } else { n };
    let new = if buy {
        add(old, amount)?
    } else {
        sub(old, amount)?
    };
    let after = potential(if yes { new } else { y }, if yes { n } else { new }, b)?;
    if buy {
        add(sub(after, before)?, ROUNDING)
    } else {
        Ok(sub(before, after)?.saturating_sub(ROUNDING))
    }
}
pub fn prorata(pool: u64, shares: u64, total: u64) -> Result<u64> {
    require!(total > 0, E::Math);
    narrow(mul(pool as u128, shares as u128)? / total as u128)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fees_and_funding_bounds() {
        for bps in [0, 1, 100, MAX_FEE_BPS] {
            for amount in [0, 1, 9_999, 10_000, MAX_Q, u64::MAX] {
                let fee = trade_fee(amount, bps).unwrap();
                assert!(fee <= amount);
                assert_eq!(fee as u128, (amount as u128 * bps as u128).div_ceil(10_000));
                assert_eq!(with_fee(amount, bps, false).unwrap().0, amount - fee);
            }
        }
        assert!(trade_fee(1, MAX_FEE_BPS + 1).is_err());
        assert!(with_fee(u64::MAX, 1, true).is_err());
        assert!(depth_for_budget(ROUNDING, 0).is_err());
        for odds in [-16_000_000, -2_197_225, -1, 0, 1, 2_197_225, 16_000_000] {
            for budget in [20_000_000, 80_000_000, MAX_B, MAX_Q] {
                let b = depth_for_budget(budget, odds).unwrap();
                let required =
                    potential(initial_offset(b, odds).unwrap(), 0, b).unwrap() + ROUNDING;
                assert!(required <= budget);
                if b < MAX_B {
                    assert!(budget - required <= 20);
                }
            }
        }
    }
    #[test]
    fn precision_and_cycle_measurements() {
        let mut max_error = 0f64;
        let mut max_price = 0f64;
        for b in [1_000_000, 100_000_000, MAX_B] {
            for i in 0..=10000 {
                let y = (b as u128 * i / 200) as u64;
                let x = y as f64 / b as f64;
                let expected = y as f64 + b as f64 * (-x).exp().ln_1p();
                max_error = max_error.max((potential(y, 0, b).unwrap() as f64 - expected).abs());
                max_price = max_price.max(
                    (price(y, 0, b).unwrap() as f64 / SCALE as f64 - 1.0 / (1.0 + (-x).exp()))
                        .abs(),
                );
                let buy = quote(y, 0, b, true, true, 101).unwrap();
                let sell = quote(y + 101, 0, b, true, false, 101).unwrap();
                assert!(buy >= sell);
            }
        }
        println!(
            "precision: max potential error={max_error} micro-USDC, max price error={max_price}"
        );
        assert!(max_error < 1.02);
        assert!(max_price < 1e-14);
        assert!(potential(u64::MAX, 0, MAX_B).is_err());
        assert!(potential(0, 0, 0).is_err());
    }
}
