-- İşbaşı SSO oturum kaydı artık tutulmuyor: company_id callback URL'inde taşınıyor
DROP TABLE IF EXISTS public.isbasi_sso_sessions;
