## Test Structure

### Files
- 'ws.gateway.integration.spec.ts' - Basic integration tests with mocked services
- 'ws.gateway.real-db.integration.spec.ts' - Real database integration tests
- 'ws.gateway.scenarios.spec.ts' - Complex test scenarios and edge cases
- 'test-websocket-gateway.ts' - Test helper class for WebSocket testing
- 'scripts/test-integration.sh' bash script to create docker containers, migrations and run the integration tests
- 'test/integration/test-websocket-gateway.ts' - Helper class for WebSocket integration test clients
- 'ws.gateway.basic.integration.spec' - Basic WebSocket gateway integration tests (connection, auth)
- 'ws.gateway.fast.integration.spec' - Fast, focused WebSocket gateway tests (unit-like integration)
- 'ws.gateway.integration.spec.ts' - General WebSocket gateway integration tests with mocks
- 'ws.gateway.real-db.integration.spec.ts' - Integration tests using a real database backend
- 'ws.gateway.scenarios.spec.ts' - Complex scenario and edge case integration tests
- 'ws.gateway.simple.integration.spec.ts' - Minimal, simple WebSocket gateway integration tests

### Test Categories

1. **Connection and Authentication**
   - WebSocket connection with valid JWT
   - Authentication failure handling
   - Token validation and refresh

2. **Task Operations**
   - Create, read, update, delete tasks
   - Task status changes
   - Task assignment
   - Pagination with index-based queries
   - Parent-child task relationships

3. **Sprint Operations**
   - Create, read, update sprints
   - Sprint status management
   - Sprint name and description updates

4. **User Operations**
   - Online user tracking
   - User presence management
   - User list retrieval

5. **Real-time Events**
   - WebSocket event broadcasting
   - Real-time synchronization
   - Event-driven updates

6. **Error Handling**
   - Invalid data validation
   - Database transaction rollbacks
   - Authentication failures
   - Service layer errors

7. **Performance and Load Testing**
   - NOT IMPLEMENTED


## Running Tests

### All tests (Recommended)
```bash
npm run test:all
```
### Only integration tests
```bash
npm run test:integratio0:
```