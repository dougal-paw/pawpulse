export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = () => new HttpError(404, "monitor not found");
export const unauthorized = () => new HttpError(401, "invalid or missing token");
