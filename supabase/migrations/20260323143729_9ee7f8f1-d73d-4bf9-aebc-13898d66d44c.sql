-- Remove duplicate subaccounts that have 0 instances linked
-- Keeping only the ones with active instances

-- q3hM78NwVipKnHSJeZas: Keep 6559b3e8 (1 instance), delete 3 others with 0 instances
DELETE FROM ghl_subaccounts WHERE id IN (
  'f853de5b-667c-4a77-a977-ea72078780d4',
  '625b75e6-5629-44d4-9e66-0cc456e634fb',
  'd1705f6c-5e0d-40c8-bc20-a79b2b0e9c34'
);

-- YQMKX2dFbWjwTLUStxuS: Keep 0b8394fd (2 instances) + bd5f781f (1 instance), delete 1 with 0 instances
DELETE FROM ghl_subaccounts WHERE id = '0e76f6fe-4163-4962-9b04-63c7685f32aa';

-- fO9fSYnbsoDLUJcNeALB: Keep 223f4b2a (1 instance), delete 1 with 0 instances
DELETE FROM ghl_subaccounts WHERE id = '6e55acf1-0b6f-42e8-9fc4-a2c97e849e04';

-- XwuKiOFSzaAq5GXqybWs: Keep 0083a931 (1 instance + token), delete 1 with 0 instances
DELETE FROM ghl_subaccounts WHERE id = '1b2e5000-be80-483c-9347-3ae9f4e7fb9e';