-- Delete orphaned profile
DELETE FROM profiles WHERE user_id = '15588a1e-3669-4d58-b52d-4c2009f96cfa';

-- Delete orphaned user_settings
DELETE FROM user_settings WHERE user_id = '15588a1e-3669-4d58-b52d-4c2009f96cfa';

-- Delete orphaned roles
DELETE FROM user_roles WHERE user_id = '15588a1e-3669-4d58-b52d-4c2009f96cfa';

-- Add admin role
INSERT INTO user_roles (user_id, role) VALUES ('1cd5ec7f-fa4e-4faf-8820-150b9834e007', 'admin');