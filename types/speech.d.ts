// Web Speech API types — not yet part of the standard TypeScript DOM lib.
// Covers both the unprefixed spec and the webkit-prefixed Chrome alias.

interface SpeechRecognitionEventMap {
  audioend:   Event;
  audiostart: Event;
  end:        Event;
  error:      SpeechRecognitionErrorEvent;
  nomatch:    SpeechRecognitionEvent;
  result:     SpeechRecognitionEvent;
  soundend:   Event;
  soundstart: Event;
  speechend:  Event;
  speechstart: Event;
  start:      Event;
}

interface SpeechRecognition extends EventTarget {
  continuous:     boolean;
  grammars:       SpeechGrammarList;
  interimResults: boolean;
  lang:           string;
  maxAlternatives: number;
  serviceURI:     string;

  abort(): void;
  start(): void;
  stop(): void;

  onaudioend:    ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onaudiostart:  ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onend:         ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onerror:       ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null;
  onnomatch:     ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
  onresult:      ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null;
  onsoundend:    ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onsoundstart:  ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onspeechend:   ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onstart:       ((this: SpeechRecognition, ev: Event) => unknown) | null;

  addEventListener<K extends keyof SpeechRecognitionEventMap>(
    type: K,
    listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof SpeechRecognitionEventMap>(
    type: K,
    listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results:     SpeechRecognitionResultList;
}

declare var SpeechRecognitionEvent: {
  prototype: SpeechRecognitionEvent;
  new(type: string, eventInitDict: SpeechRecognitionEventInit): SpeechRecognitionEvent;
};

interface SpeechRecognitionEventInit extends EventInit {
  resultIndex?: number;
  results:      SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error:   SpeechRecognitionErrorCode;
  readonly message: string;
}

declare var SpeechRecognitionErrorEvent: {
  prototype: SpeechRecognitionErrorEvent;
  new(type: string, eventInitDict: SpeechRecognitionErrorEventInit): SpeechRecognitionErrorEvent;
};

interface SpeechRecognitionErrorEventInit extends EventInit {
  error:    SpeechRecognitionErrorCode;
  message?: string;
}

type SpeechRecognitionErrorCode =
  | 'aborted'
  | 'audio-capture'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'service-not-allowed';

interface SpeechGrammar {
  src:    string;
  weight: number;
}

declare var SpeechGrammar: {
  prototype: SpeechGrammar;
  new(): SpeechGrammar;
};

interface SpeechGrammarList {
  readonly length: number;
  addFromString(string: string, weight?: number): void;
  addFromURI(src: string, weight?: number): void;
  item(index: number): SpeechGrammar;
  [index: number]: SpeechGrammar;
}

declare var SpeechGrammarList: {
  prototype: SpeechGrammarList;
  new(): SpeechGrammarList;
};

// Augment Window to include both the standard name and the webkit alias
interface Window {
  SpeechRecognition:        typeof SpeechRecognition | undefined;
  webkitSpeechRecognition:  typeof SpeechRecognition | undefined;
  SpeechGrammarList:        typeof SpeechGrammarList | undefined;
  webkitSpeechGrammarList:  typeof SpeechGrammarList | undefined;
}
