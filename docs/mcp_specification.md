# Model Context Protocol (MCP) Specification v1.0

## 1. Overview

The Model Context Protocol (MCP) is an open, low-latency communication protocol that allows authorized AI clients to query the real-time state of the AURA-X DAW.

-   **Transport:** gRPC
-   **Endpoint:** Local Sockets (Named Pipes on Windows, Unix Sockets on macOS/Linux)

## 2. Core Servers

### 2.1 `project_server.mcp`

Manages global project context.

-   **`get_bpm()`**: Returns the project's current tempo in beats per minute.
-   **`get_key()`**: Returns the project's key signature.

### 2.2 `audio_server.mcp`

Manages audio data and analysis.

-   **`analyze_audio_region(region)`**: Performs analysis (e.g., harmony) on a specified region.