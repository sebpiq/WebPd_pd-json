/*
 * Copyright (c) 2012-2020 Sébastien Piquemal <sebpiq@gmail.com>
 *
 * BSD Simplified License.
 * For information on usage and redistribution, and for a DISCLAIMER OF ALL
 * WARRANTIES, see the file, "LICENSE.txt," in this distribution.
 *
 * See https://github.com/sebpiq/WebPd_pd-parser for documentation
 *
 */

import { mutation, getters, helpers, DspGraph } from '@webpd/dsp-graph'
import { getReferencesToSubpatch, ReferencesToSubpatch } from './pdjson-helpers'
import partition from 'lodash.partition'
import { NodeBuilders, PdJson } from './types'

export const MIXER_NODE_TYPE = 'mixer~'

enum IdNamespaces {
    PD = 'pd',
    MIXER = 'mixer',
}

export type Compilation = {
    readonly pd: PdJson.Pd
    readonly graph: DspGraph.Graph
    readonly nodeBuilders: NodeBuilders
}

export default (pd: PdJson.Pd, nodeBuilders: NodeBuilders): DspGraph.Graph => {
    const compilation: Compilation = { pd, nodeBuilders, graph: {} }
    buildGraph(compilation)
    flattenGraph(compilation)
    return compilation.graph
}

export const buildGraphNodeId = (
    patchId: PdJson.ObjectGlobalId,
    nodeId: PdJson.ObjectLocalId
): DspGraph.NodeId => {
    return `${IdNamespaces.PD}_${patchId}_${nodeId}`
}

export const buildMixerNodeId = (
    sinkId: DspGraph.NodeId,
    inletId: DspGraph.PortletId
): DspGraph.NodeId => {
    return `${IdNamespaces.MIXER}_${sinkId}_${inletId}`
}

// Given the base structure of a `pd` object, convert the explicit connections into our graph format.
export const buildGraph = (compilation: Compilation): void => {
    Object.values(compilation.pd.patches).forEach((patch) => {
        Object.values(patch.nodes).forEach((pdNode) =>
            _buildGraphNode(
                compilation,
                patch,
                pdNode,
                buildGraphNodeId(patch.id, pdNode.id)
            )
        )

        // Convert pd patch connections to couples [source, sink]
        // representing connections in the graph.
        let allConnections = patch.connections.map((patchConnection) => {
            const sourceNodeId = buildGraphNodeId(
                patch.id,
                patchConnection.source.nodeId
            )
            const sinkNodeId = buildGraphNodeId(
                patch.id,
                patchConnection.sink.nodeId
            )
            const connection: [
                DspGraph.ConnectionEndpoint,
                DspGraph.ConnectionEndpoint
            ] = [
                {
                    nodeId: sourceNodeId,
                    portletId: patchConnection.source.portletId.toString(10),
                },
                {
                    nodeId: sinkNodeId,
                    portletId: patchConnection.sink.portletId.toString(10),
                },
            ]

            return _fixConnection(compilation, connection)
        })

        // In Pd, several signal sources are summed when connected to the same inlet.
        // `_buildGraphConnections` is making that behavior explicit, therefore we can't create
        // all connections one by one, and need to batch all connections to the same sink.
        while (allConnections.length) {
            const [, sink] = allConnections[0]
            let connectionsToSink: typeof allConnections
            ;[connectionsToSink, allConnections] = partition(
                allConnections,
                ([, otherSink]) => helpers.endpointsEqual(sink, otherSink)
            )

            _buildGraphConnections(
                compilation,
                patch,
                connectionsToSink.map(([source]) => source),
                sink
            )
        }
    })
}

const _buildGraphNode = (
    compilation: Compilation,
    patch: PdJson.Patch,
    pdNode: PdJson.Node,
    nodeId: DspGraph.NodeId
): DspGraph.Node => {
    const graphNodeType = pdNode.type
    const nodeBuilder = _getNodeBuilder(compilation, pdNode.type)
    const graphNodeArgs = nodeBuilder.translateArgs(pdNode, patch)
    const graphPartialNode = nodeBuilder.build(graphNodeArgs)
    return mutation.addNode(compilation.graph, {
        id: nodeId,
        type: graphNodeType,
        args: graphNodeArgs,
        sources: {},
        sinks: {},
        ...graphPartialNode,
    })
}

const _buildGraphConnections = (
    compilation: Compilation,
    patch: PdJson.Patch,
    sources: Array<DspGraph.ConnectionEndpoint>,
    sink: DspGraph.ConnectionEndpoint
): void => {
    const { graph } = compilation
    if (sources.length === 1) {
        mutation.connect(graph, sources[0], sink)
        return
    }

    // Create Mixer node according to sink type
    let mixerNode: DspGraph.Node
    const sinkNode: DspGraph.Node = compilation.graph[sink.nodeId]
    const sinkType = sinkNode.inlets[sink.portletId].type

    // Pd implicitely sums multiple signals when they are connected to the same inlet.
    // We want this behavior to be explicit, so we put a mixer node in between instead.
    if (sinkType === 'message') {
    } else if (sinkType === 'signal') {
        mixerNode = _buildGraphNode(
            compilation,
            patch,
            {
                id: 'dummy',
                type: MIXER_NODE_TYPE,
                args: [sources.length],
            },
            buildMixerNodeId(sink.nodeId, sink.portletId)
        )
    } else {
        throw new Error(`unexpected portlet type "${sinkType}"`)
    }

    // Connect all sources to mixer, and mixer output to sink.
    // We assume that each source is connected to a different inlet of the mixer node.
    if (mixerNode) {
        const mixerInletIds = Object.keys(mixerNode.inlets)
        sources.forEach((source, inletIndex) => {
            const mixerInlet = mixerInletIds[inletIndex]
            mutation.connect(graph, source, {
                nodeId: mixerNode.id,
                portletId: mixerInlet,
            })
        })
        const mixerOutlet = '0'
        mutation.connect(
            graph,
            {
                nodeId: mixerNode.id,
                portletId: mixerOutlet,
            },
            sink
        )
    } else {
        sources.forEach((source) => {
            mutation.connect(graph, source, sink)
        })
    }
}

export const _fixConnection = (
    compilation: Compilation,
    connection: [DspGraph.ConnectionEndpoint, DspGraph.ConnectionEndpoint]
): [DspGraph.ConnectionEndpoint, DspGraph.ConnectionEndpoint] => {
    const [source, sink] = connection
    const sinkNode = compilation.graph[sink.nodeId]
    const pdSinkNodeBuilder = _getNodeBuilder(compilation, sinkNode.type)
    const sourceNode = compilation.graph[source.nodeId]
    if (pdSinkNodeBuilder.rerouteConnectionIn) {
        const newInletId = pdSinkNodeBuilder.rerouteConnectionIn(
            sourceNode.outlets[source.portletId],
            sink.portletId
        )
        if (newInletId !== undefined) {
            return [source, { nodeId: sink.nodeId, portletId: newInletId }]
        }
    }
    return connection
}

const _getNodeBuilder = (
    compilation: Compilation,
    type: PdJson.ObjectType
) => {
    const nodeBuilder = compilation.nodeBuilders[type]
    if (!nodeBuilder) {
        throw new Error(`unknown node type ${type}`)
    }
    return nodeBuilder
}

// Given a pd object, inline all the subpatches into the given `graph`, so that objects indirectly wired through
// the [inlet] and [outlet] objects of a subpatch are instead directly wired into the same graph. Also, deletes
// [pd subpatch], [inlet] and [outlet] nodes (tilde or not).
export const flattenGraph = (compilation: Compilation): void => {
    const { pd } = compilation
    const patchesToInline = new Set<PdJson.ObjectGlobalId>(
        Object.keys(pd.patches)
    )
    while (patchesToInline.size) {
        patchesToInline.forEach((patchId) => {
            const subpatch = pd.patches[patchId]
            const hasDependencies = Object.values(subpatch.nodes).some(
                (node) => node.refId && patchesToInline.has(node.refId)
            )
            if (hasDependencies) {
                return
            }
            _inlineSubpatch(compilation, subpatch)
            patchesToInline.delete(subpatch.id)
        })
    }
}

// This inlines a subpatch in all the patches where it is defined.
// !!! This works only on one level. If the subpatch contains other subpatches they won't be inlined
export const _inlineSubpatch = (
    compilation: Compilation,
    subpatch: PdJson.Patch
): void => {
    const { pd, graph } = compilation
    const subpatchReferences = getReferencesToSubpatch(pd, subpatch.id)
    _inlineSubpatchInlets(compilation, subpatch, subpatchReferences)
    _inlineSubpatchOutlets(compilation, subpatch, subpatchReferences)
    subpatchReferences.forEach(([outerPatchId, subpatchPdNodeId]) =>
        mutation.deleteNode(
            graph,
            buildGraphNodeId(outerPatchId, subpatchPdNodeId)
        )
    )
}

export const _inlineSubpatchInlets = (
    compilation: Compilation,
    subpatch: PdJson.Patch,
    referencesToSubpatch: ReferencesToSubpatch
): void => {
    const { graph } = compilation
    subpatch.inlets.forEach(
        (inletPdNodeId: PdJson.ObjectLocalId, index: number) => {
            const subpatchNodeInlet = index.toString(10)
            const inletNodeId = buildGraphNodeId(subpatch.id, inletPdNodeId)

            // Sinks are nodes inside the subpatch which receive connections from the [inlet] object.
            const inletNode = getters.getNode(graph, inletNodeId)
            const sinks = getters.getSinks(inletNode, '0')

            referencesToSubpatch.forEach(([outerPatchId, subpatchPdNodeId]) => {
                // Sources are nodes outside the subpatch, which are connected to the corresponding
                // inlet of the [pd subpatch] object.
                const subpatchNode = getters.getNode(
                    graph,
                    buildGraphNodeId(outerPatchId, subpatchPdNodeId)
                )
                const sources = getters.getSources(
                    subpatchNode,
                    subpatchNodeInlet
                )
                sinks.forEach((sink) =>
                    sources.forEach((source) =>
                        mutation.connect(graph, source, sink)
                    )
                )
            })
            mutation.deleteNode(graph, inletNodeId)
        }
    )
    // The subpatch node is not deleted at this stage, because it might be used by other processing steps
    // after this one.
}

export const _inlineSubpatchOutlets = (
    compilation: Compilation,
    subpatch: PdJson.Patch,
    referencesToSubpatch: ReferencesToSubpatch
): void => {
    const { graph } = compilation
    subpatch.outlets.forEach(
        (outletPdNodeId: PdJson.ObjectLocalId, index: number) => {
            const subpatchNodeOutlet = index.toString(10)
            const outletNodeId = buildGraphNodeId(subpatch.id, outletPdNodeId)

            // Sources are nodes inside the subpatch which are connected to the [outlet] object.
            const outletNode = getters.getNode(graph, outletNodeId)
            const sources = getters.getSources(outletNode, '0')
            if (sources.length) {
                referencesToSubpatch.forEach(
                    ([outerPatchId, subpatchPdNodeId]) => {
                        // Sinks are nodes outside the subpatch, which receive connection from the corresponding
                        // outlet of the [pd subpatch] object.
                        const subpatchPdNode = getters.getNode(
                            graph,
                            buildGraphNodeId(outerPatchId, subpatchPdNodeId)
                        )
                        const sinks = getters.getSinks(
                            subpatchPdNode,
                            subpatchNodeOutlet
                        )
                        sinks.forEach((sink) =>
                            sources.forEach((source) =>
                                mutation.connect(graph, source, sink)
                            )
                        )
                    }
                )
            }

            mutation.deleteNode(graph, outletNodeId)
        }
    )
    // The subpatch node is not deleted at this stage, because it might be used by other processing steps
    // after this one.
}
