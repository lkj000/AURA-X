import json

# This would be loaded from a file or database in production
VIBE_ONTOLOGY = {
    "laid-back": {
        "aliases": ["chill", "mellow", "cafe"],
        "parameters": {
            "bpm_range": [70, 95], "key_mode": "any",
            "harmonic_complexity": "low", "rhythmic_density": "sparse"
        }
    },
    "energetic": {
        "aliases": ["upbeat", "driving", "party"],
        "parameters": {
            "bpm_range": [125, 140], "key_mode": "major",
            "harmonic_complexity": "medium", "rhythmic_density": "dense"
        }
    }
}

def translate_prompt_to_structured_input(prompt_text: str, mcp_context: dict) -> str:
    """
    The core logic of the Vibe Engine. It translates a natural language prompt
    into a highly detailed, structured input for the generative model, respecting
    any explicit context from the MCP.
    """
    found_vibe = None
    for vibe, data in VIBE_ONTOLOGY.items():
        if vibe in prompt_text or any(alias in prompt_text for alias in data["aliases"]):
            found_vibe = data
            break
    
    # Start with the original prompt
    structured_prompt_parts = [f"prompt: {prompt_text}"]
    
    # Layer on Vibe Ontology parameters if a vibe was found
    if found_vibe:
        params = found_vibe["parameters"]
        structured_prompt_parts.append(f"| bpm_range: {params['bpm_range'][0]}-{params['bpm_range'][1]}")
        structured_prompt_parts.append(f"| key_mode: {params['key_mode']}")
        # ... add other parameters
    
    # Finally, override with any explicit, real-time context from the DAW (MCP)
    # This ensures the user's current project state has the highest priority.
    if mcp_context.get("bpm"):
        structured_prompt_parts.append(f"| target_bpm: {mcp_context['bpm']}")
    if mcp_context.get("key_signature"):
        structured_prompt_parts.append(f"| target_key: {mcp_context['key_signature']}")

    return " ".join(structured_prompt_parts)