-- Add a title column to milestone_entries so Ask Hugh sessions can be labelled clearly.
ALTER TABLE milestone_entries ADD COLUMN IF NOT EXISTS title TEXT;
