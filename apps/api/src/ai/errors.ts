/** Typed AI failures. The problem filter turns them into friendly problem+json responses. */
export class AiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AiRefusalError extends AiError {
  constructor(public readonly stopDetails: unknown) {
    super("The AI declined to work with this material. Try rewording the lesson or using a different source.", 422, "ai-refusal", "AI declined the request");
  }
}

export class AiMaxTokensError extends AiError {
  constructor() {
    super("The AI ran out of room before finishing. Try a shorter source or fewer objectives.", 422, "ai-max-tokens", "AI response too long");
  }
}

export class AiOutputError extends AiError {
  constructor(detail = "The AI returned something Nibras could not read. Please try again.") {
    super(detail, 502, "ai-bad-output", "AI output invalid");
  }
}

export class AiRateLimitError extends AiError {
  constructor() {
    super("The AI service is busy right now. Wait a minute and try again.", 429, "ai-rate-limit", "AI service busy");
  }
}

export class AiUnavailableError extends AiError {
  constructor(detail = "The AI service is not available right now. Please try again shortly.") {
    super(detail, 503, "ai-unavailable", "AI service unavailable");
  }
}

export class AiBadRequestError extends AiError {
  constructor(detail = "The AI could not process this request. Try a shorter or simpler source.") {
    super(detail, 422, "ai-bad-request", "AI could not process the request");
  }
}
