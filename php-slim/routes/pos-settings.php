<?php
/**
 * POS ayarları — print_behavior alanı (resolve / save ile birleştirin).
 * Mevcut pos-settings route dosyanızda aşağıdaki yardımcıları kullanın.
 */

function posDefaultPrintBehavior(): array
{
    return [
        'satis'    => 'ask',
        'tahsilat' => 'ask',
        'odeme'    => 'ask',
    ];
}

/** DB satırından print_behavior (jsonb veya JSON string) */
function posDecodePrintBehavior($row): array
{
    $default = posDefaultPrintBehavior();
    if (empty($row['print_behavior'])) {
        return $default;
    }
    $raw = $row['print_behavior'];
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $raw = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($raw)) {
        return $default;
    }
    foreach (['satis', 'tahsilat', 'odeme'] as $key) {
        if (isset($raw[$key]) && in_array($raw[$key], ['ask', 'default', 'none'], true)) {
            $default[$key] = $raw[$key];
        }
    }
    return $default;
}

/** save payload'a print_behavior ekle */
function posMergePrintBehaviorIntoPayload(array &$payload, array $data): void
{
    if (!isset($data['print_behavior'])) {
        return;
    }
    $pb = $data['print_behavior'];
    if (is_string($pb)) {
        $pb = json_decode($pb, true);
    }
    if (!is_array($pb)) {
        return;
    }
    $payload['print_behavior'] = json_encode(posDecodePrintBehavior(['print_behavior' => $pb]));
}

/** resolve yanıtına ekle: */
// 'print_behavior' => posDecodePrintBehavior($row),
