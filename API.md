# Спецификация REST & SSE API платформы OZIZ

Базовый адрес: `http://localhost:3000/api`

---

## 1. Регистрация и анализ

### `POST /api/reports/analyze`
Выполняет предварительный мультимодальный анализ изображения через Gemini 3.8 Flash Vision.

**Тело запроса (JSON):**
```json
{
  "image_base64": "data:image/jpeg;base64,...",
  "user_text": "Глубокая яма возле школы",
  "lat": 51.1342,
  "lng": 71.4308
}
```

**Ответ (200 OK):**
```json
{
  "success": true,
  "ai_analysis": {
    "category": "pothole",
    "subcategory": "Выбоина дорожного полотна",
    "description_ai": "Выявлена выбоина асфальтобетонного покрытия глубиной более 8 см...",
    "severity": 4,
    "hazard_to": ["drivers", "cyclists"],
    "estimated_size": { "value": 75, "unit": "cm" },
    "confidence": 0.94,
    "text_photo_consistent": true,
    "needs_human_review": false,
    "is_emergency": false,
    "detected_objects": ["асфальт", "выбоина"]
  }
}
```

---

### `POST /api/reports`
Регистрирует обращение гражданина: производит анализ ИИ, запрашивает метеоданные, вычисляет приоритет, подбирает ответственную службу и минтит запись в реестре Solana.

**Тело запроса (JSON):**
```json
{
  "image_base64": "data:image/jpeg;base64,...",
  "user_text": "Открыт люк на тротуаре",
  "lat": 51.1342,
  "lng": 71.4308,
  "accuracy_m": 8.5,
  "address": "ул. Тауелсиздик, 14",
  "district": "Алматинский район"
}
```

**Ответ (201 Created):**
```json
{
  "success": true,
  "report": {
    "id": "c1a01101-7001-4000-8000-000000000002",
    "short_code": "OZIZ-2026-002",
    "priority": { "score": 92, "level": "CRITICAL" },
    "assigned_service_name": "ГорВодоканал",
    "onchain": {
      "report_pda": "Rep882046244799...",
      "tx_signature": "5KnN9pLqZ...",
      "explorer_url": "https://explorer.solana.com/tx/5KnN9pLqZ...?cluster=devnet"
    }
  }
}
```

---

## 2. Получение и фильтрация обращений

### `GET /api/reports`
Возвращает список обращений с поддержкой фильтрации.

**Параметры запроса (Query Params):**
- `category` (например, `pothole`, `open_manhole`)
- `status` (например, `NEW`, `IN_PROGRESS`, `RESOLVED`)
- `priority` (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`)
- `district` (подстрока названия района)
- `search` (поисковый запрос по адресу, номеру или описанию)

---

### `GET /api/reports/:id`
Возвращает полную карточку обращения, включая историю событий и ончейн-метаданные.

---

## 3. Гражданское участие

### `POST /api/reports/:id/confirm`
Регистрирует подтверждение «Я тоже вижу» (+1 голос). Пересчитывает фактор дубликатов и приоритет.

### `POST /api/reports/:id/vote`
Голосование жителей за качество устранения после статуса `RESOLVED`.
- `is_fixed: true` — подтверждение качественного ремонта.
- `is_fixed: false` — сигнал о браке. При кворуме голосов жалоба автоматически переоткрывается (`REOPENED`) с фиксацией нарушения SLA в Solana.

---

## 4. Панель диспетчера городских служб

### `POST /api/reports/:id/status`
Смена статуса оператором службы с публикацией в блокчейн.
```json
{
  "status": "IN_PROGRESS | RESOLVED | REJECTED",
  "actor_title": "Бригада ГорДорСтрой №4",
  "note": "Выполнены работы по фрезерованию и укладке асфальта",
  "resolution_media_url": "https://..."
}
```
*Примечание:* Для статуса `REJECTED` передача `note` является обязательной.

---

## 5. Аудит, прозрачность и экспорт

### `GET /api/solana/verify/:id`
Криптографический аудит целостности цепочки хэшей `prev_event_hash` и сравнение состояния БД с блокчейном Solana.

### `GET /api/stats/transparency`
Публичные рейтинги служб, среднее время реагирования, статистика срывов SLA и сравнительные метрики районов.

### `GET /api/export/geojson`
Экспорт полного набора геоданных в формате GeoJSON для независимых аналитиков и урбанистов.

### `GET /api/export/csv`
Экспорт обращений в виде CSV-таблицы.

---

## 6. Real-time события (SSE)

### `GET /api/events/live`
Поток Server-Sent Events для оперативного центра:
- `report_created` — новое зарегистрированное обращение
- `report_updated` — изменение статуса службой
- `report_confirmed` — подтверждение гражданами
