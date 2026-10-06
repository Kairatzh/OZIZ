# Смарт-контракт Solana: Civic Registry (Anchor)

Программа: `OZ1ZcivicRegistry1111111111111111111111111111`
Язык: **Rust** + фреймворк **Anchor 0.29.0**
Сеть: **Solana Devnet / Localnet**

---

## 1. Принципы неизменяемости (Proof of Immutability)

1. **Строго Append-Only:**
   В коде `programs/civic_registry/src/lib.rs` **отсутствуют** инструкции `update`, `delete` или макрос закрытия аккаунта `close = ...`. Аккаунт жалобы создается один раз и не может быть удален ни заявителем, ни государственным органом, ни разработчиком.

2. **Ончейн хранятся только хэши:**
   Для соблюдения приватности и масштабируемости в блокчейн записываются:
   - `media_sha256` и IPFS/Arweave `media_cid` (само фото хранится децентрализованно)
   - `reporter_hash` = $\text{SHA256}(\text{пользователь} + \text{соль})$
   - `text_sha256` = хэш текста описания
   - `ai_analysis_sha256` = хэш полного JSON-ответа модели Gemini

3. **Криптографическая цепочка хэшей событий (`StatusEvent`):**
   Каждое новое событие проверяет:
   - $\text{seq} == \text{report.event\_count}$ (строго по порядку, пропуск номеров невозможен)
   - $\text{prev\_event\_hash} == \text{hash}(\text{seq}-1)$ (неразрывная криптографическая цепь)

---

## 2. Структуры аккаунтов (Accounts)

### `Report` (PDA: `["report", report_id]`)
```rust
#[account]
pub struct Report {
    pub report_id: [u8; 16],          // UUID v4
    pub reporter_hash: [u8; 32],      // Анонимизированный хэш заявителя
    pub media_sha256: [u8; 32],       // Контрольная сумма медиа
    pub media_cid: String,            // IPFS CIDv1 (до 64 байт)
    pub text_sha256: [u8; 32],        // Хэш текста
    pub geo_cell: u64,                // Пространственный H3-индекс
    pub category: u8,                 // Код категории (1..11)
    pub priority: u8,                 // Уровень приоритета (1..4)
    pub ai_analysis_sha256: [u8; 32], // Хэш заключения ИИ
    pub created_at: i64,              // Время создания (Unix timestamp)
    pub event_count: u32,             // Счетчик событий
    pub bump: u8,
}
```

### `StatusEvent` (PDA: `["event", report, seq]`)
```rust
#[account]
pub struct StatusEvent {
    pub report: Pubkey,               // Ссылка на аккаунт жалобы
    pub seq: u32,                     // Порядковый номер (0, 1, 2...)
    pub prev_event_hash: [u8; 32],    // Хэш предыдущего события
    pub status: u8,                   // Новый статус (NEW..RESOLVED)
    pub actor_role: u8,               // 1: citizen, 2: service, 3: oracle
    pub actor: Pubkey,                // Публичный ключ исполнителя
    pub note_sha256: [u8; 32],        // Хэш обоснования или отчета
    pub timestamp: i64,               // Время события
    pub bump: u8,
}
```

---

## 3. Инструкции смарт-контракта

| Инструкция | Описание | Ограничения безопасности |
| :--- | :--- | :--- |
| `submit_report` | Инициализация жалобы | Создает аккаунт `Report` и генезис-событие `seq = 0`. Нельзя перезаписать существующий ID. |
| `append_status` | Добавление нового статуса | Требует строгий инкремент `seq` и валидный `prev_event_hash`. **При статусе REJECTED требует ненулевой `note_sha256`!** |
| `citizen_confirm` | Подтверждение «Я тоже вижу» | Защита от накруток через PDA `["confirm", report, reporter_hash]`. Один голос на человека. |
| `citizen_vote_resolution` | Голосование за ремонт | Голос «починено / не починено». При кворуме возражений порождает событие `REOPENED`. |
| `record_sla_violation` | Фиксация срыва SLA | Подписывается доверенным Oracle при превышении дедлайна. |

---

## 4. Верификация тестами (Test Suite)
В файле `tests/civic_registry.ts` реализован автоматический набор проверок:
1. Создание отчета (`submit_report`) с валидным генезис-хэшем — `PASSED`
2. Переход в статус `AI_VERIFIED` (`seq = 1`) — `PASSED`
3. Назначение службе `ASSIGNED` (`seq = 2`) — `PASSED`
4. Попытка отклонить жалобу без причины (`REJECTED` с пустым хэшем) — `REJECTED (CivicError::RejectionReasonRequired)`
5. Попытка нарушить последовательность (`seq = 99`) — `BLOCKED (CivicError::SequenceMismatch)`
6. Полная проверка целостности цепи — `VERIFIED`

Запуск тестов:
```bash
npx tsx tests/civic_registry.ts
```
