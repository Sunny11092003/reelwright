export interface JsonRequest {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface VideoRequest {
  videoUrl: string;
  mimeType: string;
  displayName: string;
  system: string;
  prompt: string;
}

/** Provider-agnostic AI interface. Add a new provider by implementing this and registering it in ./index.ts. */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  readonly supportsVideo: boolean;
  generateJson(req: JsonRequest): Promise<unknown>;
  analyzeVideo(req: VideoRequest): Promise<unknown>;
}
