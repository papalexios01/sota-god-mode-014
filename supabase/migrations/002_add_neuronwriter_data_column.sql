-- Migration: Add neuronwriter_data column to persist full NeuronWriter analysis
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- This fixes the "NeuronWriter Not Connected" issue after page reloads

-- Add the JSONB column to store full NeuronWriter analysis data
ALTER TABLE generated_blog_posts
ADD COLUMN IF NOT EXISTS neuronwriter_data JSONB DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN generated_blog_posts.neuronwriter_data IS 'Full NeuronWriter analysis data (terms, entities, headings, etc.) stored as JSONB';
