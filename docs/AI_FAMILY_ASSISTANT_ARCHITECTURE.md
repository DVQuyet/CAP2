# AI Family Assistant Architecture

## Principle

Relationship data is decided only by the rule engine:

```text
User message
  -> intentParserService
  -> memberSearchService
  -> relationshipEngine BFS
  -> vietnameseKinshipRules
  -> relationshipExplanationService
  -> chatbotController response
```

The AI/NLP layer may understand language and generate wording later. It must not invent family facts.

## Backend Structure

```text
Backend/src/modules/chatbot/
  chatbotRoutes.js
  chatbotController.js
  chatbotSecurity.js
  chatbotSuggestionService.js
  intentParserService.js
  memberSearchService.js
  relationshipEngine.js
  relationshipExplanationService.js
  vietnameseKinshipRules.js
```

## Graph Model

```text
people + families + children
  -> adjacency index by person id
  -> bidirectional BFS
  -> relationshipPath
  -> Vietnamese kinship label
```

Example:

```text
Bạn -> father -> older_brother
= bác
```

## API

```http
POST /api/chatbot/ask
POST /api/chatbot/voice
GET  /api/chatbot/history
GET  /api/chatbot/suggestions
GET  /api/chatbot/relationship/:id
GET  /api/chatbot/path
```

Example:

```json
{
  "message": "Ông Nguyễn Văn A là gì của tôi?",
  "clanId": 1,
  "currentMemberId": 10
}
```

## Frontend Structure

```text
Frontend/src/api/chatbotService.js
Frontend/src/features/ai-chat/components/
  AIChatGateway.jsx
  ChatWindow.jsx
  MessageBubble.jsx
  TypingIndicator.jsx
  SuggestionChips.jsx
  RelationshipCard.jsx
  FamilyPathVisualizer.jsx
  VoiceInputButton.jsx
```

`AIChatGateway` is mounted in member and manager layouts.

## Database

```text
person_aliases
chatbot_messages
relationship_cache
family_graph_versions
children.child_type
graph version triggers for families/children
```

Run:

```text
database/migrations/2026_05_28_create_chatbot_support_tables.sql
database/migrations/2026_05_28_02_chatbot_graph_version_triggers.sql
```

## Realtime

Socket event emitted after assistant response:

```text
chatbot_answered
```

This is intentionally lightweight. Streaming tokens can be added later without changing the rule engine.
