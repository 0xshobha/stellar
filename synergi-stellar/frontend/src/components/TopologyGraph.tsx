'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useRef } from 'react';
import { StreamEvent } from '../lib/types';

interface TopologyGraphProps {
  events: StreamEvent[];
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: 'user' | 'manager' | 'worker';
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  recursive?: boolean;
  amount?: number;
  highlighted?: boolean;
}

export default function TopologyGraph({ events }: TopologyGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const graph = useMemo(() => {
    const nodes = new Map<string, GraphNode>([
      ['User', { id: 'User', type: 'user' }],
      ['Manager', { id: 'Manager', type: 'manager' }]
    ]);

    const links: GraphLink[] = [{ source: 'User', target: 'Manager', highlighted: true }];

    events.forEach((event) => {
      const isPaymentEvent = event.type === 'paid' || event.type === 'recursive-paid';
      const isHiringEvent = event.type === 'hiring' || event.type === 'step-start';
      if (!isPaymentEvent && !isHiringEvent) return;

      const agent = typeof event.agent === 'string' ? event.agent : null;
      if (!agent) return;
      if (!nodes.has(agent)) {
        nodes.set(agent, { id: agent, type: 'worker' });
      }

      const source = typeof event.source === 'string' ? event.source : 'Manager';
      if (!nodes.has(source)) {
        nodes.set(source, { id: source, type: source === 'User' ? 'user' : source === 'Manager' ? 'manager' : 'worker' });
      }

      links.push({
        source,
        target: agent,
        recursive: Number(event.depth ?? 0) > 1 || source === 'DeepResearch',
        amount: Number(event.amount ?? event.price ?? 0),
        highlighted: isPaymentEvent
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      links
    };
  }, [events]);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 620;
    const height = 300;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#64748b');

    const simulation = d3
      .forceSimulation(graph.nodes)
      .force('link', d3.forceLink(graph.links).id((d) => (d as GraphNode).id).distance(95))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(26));

    const link = svg
      .append('g')
      .selectAll('line')
      .data(graph.links)
      .enter()
      .append('line')
      .attr('stroke', (d) => (d.recursive ? '#f59e0b' : d.highlighted ? '#2563eb' : '#64748b'))
      .attr('stroke-width', (d) => (d.recursive ? 2.7 : d.highlighted ? 2.2 : 1.6))
      .attr('stroke-dasharray', (d) => (d.recursive ? '5,4' : '0'))
      .attr('marker-end', 'url(#arrow)')
      .attr('opacity', (d) => (d.highlighted ? 1 : 0.8));

    link
      .transition()
      .duration(850)
      .attr('stroke-opacity', 0.5)
      .transition()
      .duration(850)
      .attr('stroke-opacity', 1)
      .on('end', function repeat() {
        d3.select(this)
          .transition()
            .duration(780)
            .attr('stroke-opacity', 0.45)
          .transition()
            .duration(780)
          .attr('stroke-opacity', 1)
          .on('end', repeat);
      });

    const node = svg
      .append('g')
      .selectAll('g')
      .data(graph.nodes)
      .enter()
      .append('g')
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node
      .append('circle')
      .attr('r', (d) => (d.type === 'manager' ? 18 : 14))
      .attr('fill', (d) => (d.type === 'manager' ? '#2563eb' : d.type === 'user' ? '#0ea5e9' : '#334155'))
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1.2);

    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 30)
      .attr('fill', '#334155')
      .attr('font-size', 11.5)
      .attr('font-weight', 600)
      .text((d) => d.id);

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graph]);

  return (
    <section className="panel">
      <h2 className="text-lg font-semibold text-slate-900">Topology</h2>
      <p className="mt-1 text-xs text-slate-500">Blue links show manager payments; amber links show recursive DeepResearch hires.</p>
      <svg className="mt-3 w-full rounded-xl border border-slate-200 bg-white shadow-inner" ref={svgRef} viewBox="0 0 620 300" />
    </section>
  );
}
