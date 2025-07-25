-- Migration script to update attendance table structure
-- Run this on your existing Azure PostgreSQL database to add the new columns

-- Step 1: Add the new columns
ALTER TABLE attendance 
ADD COLUMN IF NOT EXISTS check_in_location_code VARCHAR(15),
ADD COLUMN IF NOT EXISTS check_out_location_code VARCHAR(15);

-- Step 2: Migrate existing data (if you have any data in the old location_code column)
-- This will copy the existing location_code to check_in_location_code
-- You can modify this based on your business logic
UPDATE attendance 
SET check_in_location_code = location_code 
WHERE location_code IS NOT NULL AND check_in_location_code IS NULL;

-- Step 3: (Optional) Drop the old location_code column after confirming the migration worked
-- Uncomment the line below only after you've verified the new structure works correctly
-- ALTER TABLE attendance DROP COLUMN IF EXISTS location_code;

-- Step 4: Verify the new structure
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'attendance' 
AND column_name LIKE '%location_code%'
ORDER BY column_name;
