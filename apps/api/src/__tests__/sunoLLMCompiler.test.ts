import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const mockCreate = jest.fn().mockResolvedValue({
  content: [{
    type: "text",
    text: JSON.stringify({
      style_prompt: "amapiano, deep house, log drums, warm rhodes, 112 BPM, F#m, late night, private school vibes, kwaito bass, organic groove, luxury noir, Johannesburg",
      lyrics_prompt: "[INTRO]\ninstrumental\n\n[VERSE]\nWoza lapha\nEbusuku obuhle\n\n[DROP]\ninstrumental\n\n[CHORUS]\nSiyabamba\nNgiyakhala\n\n[OUTRO]\ninstrumental\n\nEmotional core: late night introspection",
    }),
  }],
});

const mockAnthropicConstructor = jest.fn().mockImplementation(() => ({
  messages: { create: mockCreate },
}));

jest.mock("@anthropic-ai/sdk", () => ({
  __esModule: true,
  default: mockAnthropicConstructor,
}));

jest.mock("@aura-x/suno-exporter", () => ({
  exportForSuno: jest.fn().mockReturnValue({
    style_prompt: "static style prompt fallback",
    lyrics_prompt: "[INTRO]\nstatic lyrics fallback",
    warnings: [],
  }),
}));

import { compileSunoPromptsWithLLM } from "../generation/sunoLLMCompiler";
import { privateSchoolPreset, mbiraianoPreset } from "@aura-x/ctl";
import { exportForSuno } from "@aura-x/suno-exporter";

const FAKE_KEY = "sk-ant-test-fake-key";

describe("Suno LLM Compiler", () => {

  beforeEach(() => {
    mockCreate.mockClear();
    mockAnthropicConstructor.mockClear();
    (exportForSuno as jest.Mock).mockReturnValue({
      style_prompt: "static style prompt fallback",
      lyrics_prompt: "[INTRO]\nstatic lyrics fallback",
      warnings: [],
    });
    mockCreate.mockResolvedValue({
      content: [{
        type: "text",
        text: JSON.stringify({
          style_prompt: "amapiano, deep house, log drums, warm rhodes, 112 BPM, F#m, late night, private school vibes, kwaito bass, organic groove, luxury noir, Johannesburg",
          lyrics_prompt: "[INTRO]\ninstrumental\n\n[VERSE]\nWoza lapha\nEbusuku obuhle\n\n[DROP]\ninstrumental\n\n[CHORUS]\nSiyabamba\nNgiyakhala\n\n[OUTRO]\ninstrumental\n\nEmotional core: late night introspection",
        }),
      }],
    });
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("1. returns LLM result when ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const result = await compileSunoPromptsWithLLM(privateSchoolPreset);
    expect(result.source).toBe("llm");
    expect(result.style_prompt.length).toBeGreaterThan(0);
    expect(result.lyrics_prompt.length).toBeGreaterThan(0);
  });

  it("2. LLM style_prompt contains genre-relevant tags", async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const result = await compileSunoPromptsWithLLM(privateSchoolPreset);
    expect(result.style_prompt.toLowerCase()).toMatch(/amapiano|log drum|house/);
  });

  it("3. LLM lyrics_prompt contains Suno section metatags", async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const result = await compileSunoPromptsWithLLM(privateSchoolPreset);
    expect(result.lyrics_prompt).toMatch(/\[[A-Z]+\]/);
  });

  it("4. style_prompt stays within 1000-char Suno limit", async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const result = await compileSunoPromptsWithLLM(privateSchoolPreset);
    expect(result.style_prompt.length).toBeLessThanOrEqual(1000);
  });

  it("5. falls back to static when ANTHROPIC_API_KEY is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await compileSunoPromptsWithLLM(privateSchoolPreset);
    expect(result.source).toBe("static");
    expect(exportForSuno).toHaveBeenCalledTimes(1);
  });

  it("6. static fallback returns non-empty prompts", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await compileSunoPromptsWithLLM(privateSchoolPreset);
    expect(result.style_prompt.length).toBeGreaterThan(0);
    expect(result.lyrics_prompt.length).toBeGreaterThan(0);
  });

  it("7. works with mbiraiano preset (different subgenre)", async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const result = await compileSunoPromptsWithLLM(mbiraianoPreset);
    expect(result.source).toBe("llm");
  });

  it("8. falls back to static when LLM returns malformed JSON", async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not valid json at all" }],
    });
    const result = await compileSunoPromptsWithLLM(privateSchoolPreset);
    expect(result.source).toBe("static");
  });

  it("9. Anthropic client called with correct model", async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    await compileSunoPromptsWithLLM(privateSchoolPreset);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5-20251001" })
    );
  });

  it("10. CTL summary passed to LLM includes subgenre and BPM", async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    await compileSunoPromptsWithLLM(privateSchoolPreset);
    const callArg = mockCreate.mock.calls[0][0];
    const userMessage = callArg.messages[0].content as string;
    expect(userMessage).toContain("private school");
    expect(userMessage).toContain("BPM");
  });

});
