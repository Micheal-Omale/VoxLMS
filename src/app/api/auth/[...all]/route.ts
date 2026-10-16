// Better Auth is never reachable over HTTP (spec 0004, AC-1). Every sign in,
// password and admin operation is our own server action calling it on the server.
const notFound = () => new Response("Not found", { status: 404 });

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
