-- Temporarily disable the trigger, update existing users, then re-enable
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_non_admin_account_mode_change;

UPDATE public.profiles 
SET account_mode = 'connections' 
WHERE account_mode IS NULL OR account_mode = 'instances';

ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_non_admin_account_mode_change;