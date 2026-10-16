// Typed errors from the data layer. Callers (Server Actions, route handlers)
// turn these into plain messages; nothing here is shown to users raw.

export class DataError extends Error {}

export class NotFound extends DataError {
  constructor(public readonly what: string) {
    super(`${what} not found`);
  }
}

export class NoCurrentTerm extends DataError {
  constructor() {
    super("No current term is set for this school");
  }
}

export class NotSignedIn extends DataError {
  constructor() {
    super("A signed-in user is required to save");
  }
}

export class InvalidScore extends DataError {
  constructor(
    public readonly studentId: string,
    public readonly componentKey: string,
    public readonly value: string,
    reason: string,
  ) {
    super(`Score "${value}" for ${componentKey} is not valid: ${reason}`);
  }
}

export class ScoreAboveMaximum extends DataError {
  constructor(
    public readonly studentId: string,
    public readonly componentLabel: string,
    public readonly max: string,
    public readonly value: string,
  ) {
    super(`${componentLabel} is out of ${max}. You wrote ${value}.`);
  }
}

export class NotTakingSubject extends DataError {
  constructor(public readonly studentIds: string[]) {
    super(`${studentIds.length} student(s) are not taking this subject this term`);
  }
}

export class Conflict extends DataError {
  constructor(public readonly studentIds: string[]) {
    super(`Scores for ${studentIds.length} student(s) were changed by someone else since you opened the sheet`);
  }
}
