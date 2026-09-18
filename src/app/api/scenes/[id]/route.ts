import { type NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const dynamic = 'force-dynamic'

declare global {
  var __memoryScenesCache: Record<string, any> | undefined
}

function getMemoryScene(id: string): any | null {
  if (!globalThis.__memoryScenesCache) globalThis.__memoryScenesCache = {}
  if (globalThis.__memoryScenesCache[id]) return globalThis.__memoryScenesCache[id]

  if (id === 'bursa_baskoy' || id === 'layout_2026-09-11' || id === 'default') {
    const candidatePaths = [
      join(process.cwd(), 'public/assets/data/layout_bursa.json'),
      join(process.cwd(), 'public/assets/data/layout_2026-09-11.json'),
      resolve('E:/Digital Twin/panel/public/assets/data/layout_bursa.json'),
      resolve('E:/Digital Twin/editor/apps/editor/public/assets/data/layout_bursa.json'),
    ]
    for (const p of candidatePaths) {
      if (existsSync(p)) {
        try {
          const raw = JSON.parse(readFileSync(p, 'utf8'))
          const nodes = raw.nodes || raw.graph?.nodes || raw
          const scene = {
            id,
            name: 'BURSA BAŞKÖY EXT',
            version: 1,
            nodeCount: Object.keys(nodes).length,
            graph: { nodes },
            nodes,
            ownerId: null,
          }
          globalThis.__memoryScenesCache[id] = scene
          return scene
        } catch (_e) {}
      }
    }
  }
  return null
}

type RouteParams = { params: Promise<{ id: string }> }

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const scene = getMemoryScene(id)
  if (scene) {
    return NextResponse.json(scene, {
      headers: {
        'ETag': `"${scene.version || 1}"`,
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
  return NextResponse.json({ error: 'not_found' }, { status: 404 })
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const scene = getMemoryScene(id) || {
    id,
    name: 'BURSA BAŞKÖY EXT',
    version: 1,
    graph: { nodes: {} },
    nodes: {},
  }

  const patch = body.patch || {}
  const targetNodes = scene.graph?.nodes || scene.nodes || {}

  for (const [nodeId, nodePatch] of Object.entries(patch)) {
    if (nodePatch && typeof nodePatch === 'object') {
      targetNodes[nodeId] = {
        ...(targetNodes[nodeId] || {}),
        ...(nodePatch as any),
      }
    }
  }

  scene.version = (scene.version || 1) + 1
  scene.nodeCount = Object.keys(targetNodes).length
  scene.graph = { nodes: targetNodes }
  scene.nodes = targetNodes

  if (!globalThis.__memoryScenesCache) globalThis.__memoryScenesCache = {}
  globalThis.__memoryScenesCache[id] = scene

  return NextResponse.json({
    ok: true,
    id,
    version: scene.version,
    nodeCount: scene.nodeCount,
  })
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const scene = getMemoryScene(id) || {
    id,
    name: body.name || 'BURSA BAŞKÖY EXT',
    version: 1,
    graph: { nodes: {} },
  }

  if (body.graph?.nodes) {
    scene.graph = { nodes: body.graph.nodes }
    scene.nodes = body.graph.nodes
  }
  if (body.name) scene.name = body.name

  scene.version = (scene.version || 1) + 1
  scene.nodeCount = Object.keys(scene.graph?.nodes || {}).length

  if (!globalThis.__memoryScenesCache) globalThis.__memoryScenesCache = {}
  globalThis.__memoryScenesCache[id] = scene

  return NextResponse.json({
    ok: true,
    id,
    version: scene.version,
    nodeCount: scene.nodeCount,
  })
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  if (globalThis.__memoryScenesCache && globalThis.__memoryScenesCache[id]) {
    delete globalThis.__memoryScenesCache[id]
  }
  return new NextResponse(null, { status: 204 })
}
