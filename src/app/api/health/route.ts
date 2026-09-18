export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    status: 'ok',
    app: 'digitaltwin-console',
    version: '0.10.0',
    db: 'ok',
    timestamp: new Date().toISOString(),
  })
}
