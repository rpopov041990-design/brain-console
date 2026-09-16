# Реестр и данные

Минимальный вымышленный пример собственного реестра:

```json
{
  "personas": {
    "example-thread": {
      "name": "Пример",
      "role": "Исследователь",
      "project": "Учебный проект",
      "team": "Исследования",
      "traits": ["проверяет источники"],
      "capabilities": ["Анализ"],
      "execution": {"default_priority": "P2", "default_thinking": "medium"}
    }
  },
  "supervisor": {"name": "Координатор"},
  "quality_reviewer": {"name": "Рецензент"},
  "verified_collaboration_routes": {"routes": {}}
}
```

Маршрут — объект с `source_thread_id`, `target_thread_id`, `status: "verified"`, `label` и `direction: "bidirectional"` для двусторонней связи. Ссылки на несуществующие профили пропускаются.

В Neo4j `TaskPersona.thread_id` связывается с ключом реестра. `TaskTeam.name` и `TaskCapability.name` должны совпадать с названиями команды и навыка. Приложение читает только выбранную группу. Поля `content` и пароли не экспортируются; названия, роли и описания тоже могут быть личными данными — защищайте live-режим.
