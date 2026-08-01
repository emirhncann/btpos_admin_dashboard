-- Fiş davranışı: satış / tahsilat / ödeme sonrası yazdırma modu
ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS print_behavior jsonb DEFAULT '{
    "satis":    "ask",
    "tahsilat": "ask",
    "odeme":    "ask"
  }'::jsonb;
