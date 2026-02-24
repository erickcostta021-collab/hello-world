
-- Step 1: Delete the duplicate subaccount from new user (same location_id already exists in old user)
DELETE FROM ghl_subaccounts WHERE id = '73c3c6e5-4d10-41d2-8358-5a0bbf9f14ac';

-- Step 2: Transfer all subaccounts from old user to new user
UPDATE ghl_subaccounts 
SET user_id = '0e7ab950-1307-4407-bd6d-065b5acb00ab', updated_at = now()
WHERE user_id = 'ae2ad04f-6e31-4fbb-a020-c55bae472c64';

-- Step 3: Remove mirror mode (shared_from_user_id)
UPDATE user_settings 
SET shared_from_user_id = NULL, updated_at = now()
WHERE user_id = '0e7ab950-1307-4407-bd6d-065b5acb00ab';

-- Step 4: Clean up any remaining data from old user
DELETE FROM user_settings WHERE user_id = 'ae2ad04f-6e31-4fbb-a020-c55bae472c64';
DELETE FROM user_roles WHERE user_id = 'ae2ad04f-6e31-4fbb-a020-c55bae472c64';
