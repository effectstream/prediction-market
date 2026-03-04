-- Prediction Market Database Schema
-- Initial migration

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    account_id INTEGER PRIMARY KEY,
    display_name TEXT,
    points INTEGER NOT NULL DEFAULT 1000,
    discord_username TEXT,
    discord_linked BOOLEAN DEFAULT false,
    total_bets INTEGER DEFAULT 0,
    total_won INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Markets table
CREATE TABLE IF NOT EXISTS markets (
    market_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'open', -- open, closed, resolved
    close_time TIMESTAMP NOT NULL,
    resolved_option_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Market options table
CREATE TABLE IF NOT EXISTS market_options (
    option_id TEXT NOT NULL,
    market_id TEXT NOT NULL REFERENCES markets(market_id),
    label TEXT NOT NULL,
    total_staked INTEGER NOT NULL DEFAULT 0,
    bet_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (market_id, option_id)
);

-- Bets table
CREATE TABLE IF NOT EXISTS bets (
    bet_id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL REFERENCES markets(market_id),
    option_id TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    amount INTEGER NOT NULL, -- 10, 25, or 50 points
    status TEXT NOT NULL DEFAULT 'pending', -- pending, won, lost
    payout INTEGER,
    placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    UNIQUE (market_id, account_id) -- one bet per market per user
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_close_time ON markets(close_time);
CREATE INDEX IF NOT EXISTS idx_bets_market ON bets(market_id);
CREATE INDEX IF NOT EXISTS idx_bets_account ON bets(account_id);
CREATE INDEX IF NOT EXISTS idx_market_options_market ON market_options(market_id);
