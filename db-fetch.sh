#!/bin/bash

# Simple script to fetch latest database schema from Supabase
# Usage: ./db-fetch.sh or just "dbfetch" (if in PATH)

set -e

echo "🔄 Fetching latest schema from Supabase database..."

# Change to the script directory
SCRIPT_DIR="$(dirname "$0")"
cd "$SCRIPT_DIR"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if we're logged in to Supabase
echo "🔐 Checking Supabase authentication..."
if ! supabase projects list &> /dev/null; then
    echo "🔑 Not logged in to Supabase. Please log in first:"
    echo "   Running: supabase login"
    supabase login
fi

# List available projects to help user select the correct one
echo "📋 Available Supabase projects:"
supabase projects list

echo ""
echo "🔗 Please ensure you're linked to the correct project."
echo "   If not linked, run: supabase link --project-ref YOUR_PROJECT_REF"
echo ""

# Check if project is linked
if [ ! -f "supabase/config.toml" ]; then
    echo "⚠️  No Supabase project linked in this directory."
    echo "   Please link your project first with: supabase link --project-ref YOUR_PROJECT_REF"
    exit 1
fi

# Use Supabase CLI to dump the latest schema
echo "📥 Dumping database schema..."
supabase db dump --linked -f dotazniky-db-schema.sql

# Move the file from project root to this directory if it was created there
if [ -f "../dotazniky-db-schema.sql" ]; then
    mv "../dotazniky-db-schema.sql" "./dotazniky-db-schema.sql"
fi

# Check if the schema file was created successfully
if [ -f "./dotazniky-db-schema.sql" ]; then
    echo "✅ Schema updated: $SCRIPT_DIR/dotazniky-db-schema.sql"
    echo "📊 File size: $(du -h "$SCRIPT_DIR/dotazniky-db-schema.sql" | cut -f1)"
    echo "📝 Lines: $(wc -l < "$SCRIPT_DIR/dotazniky-db-schema.sql")"
else
    echo "❌ Failed to create schema file. Please check your Supabase configuration."
    exit 1
fi

echo ""
echo "🎉 Database schema fetch completed successfully!" 