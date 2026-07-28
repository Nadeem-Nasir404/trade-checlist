import { Client } from "@notionhq/client";
import { NextResponse } from "next/server";

import {
  calculateMetrics,
  createJournalKey,
  fmtDate,
  formatBiasLabel,
  getInstrumentConfig,
  normalizeState,
  parseDateStr
} from "../../../lib/defaults";

export const dynamic = "force-dynamic";

function notionConfigured() {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
}

function getNotion() {
  return new Client({ auth: process.env.NOTION_TOKEN });
}

function richText(text) {
  if (!text) {
    return [{ type: "text", text: { content: "-" } }];
  }

  const chunks = [];
  for (let index = 0; index < text.length; index += 1800) {
    chunks.push({
      type: "text",
      text: {
        content: text.slice(index, index + 1800)
      }
    });
  }
  return chunks;
}

function paragraphBlock(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: richText(text)
    }
  };
}

function headingBlock(text) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: richText(text)
    }
  };
}

function todoBlock(text, checked) {
  return {
    object: "block",
    type: "to_do",
    to_do: {
      checked,
      rich_text: richText(text)
    }
  };
}

function bulletBlock(text) {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: richText(text)
    }
  };
}

function buildProperties({ ticker, day, state }) {
  const metrics = calculateMetrics(state, ticker);
  const setup = metrics.setup;
  const journalKey = createJournalKey(ticker, day);

  return {
    Journal: {
      title: [
        {
          type: "text",
          text: {
            content: `${ticker} - ${day}`
          }
        }
      ]
    },
    "Trade Date": {
      date: {
        start: day
      }
    },
    Instrument: {
      rich_text: richText(ticker)
    },
    Bias: state.bias
      ? {
          select: {
            name: formatBiasLabel(state.bias)
          }
        }
      : null,
    Readiness: {
      number: metrics.readiness
    },
    Setup: {
      select: {
        name: setup.label
      }
    },
    "Trade Count": {
      number: state.trades.length
    },
    "Net R": {
      number: metrics.netR
    },
    "Journal Key": {
      rich_text: richText(journalKey)
    }
  };
}

function buildBlocks({ ticker, day, state }) {
  const safeState = normalizeState(state);
  const instrument = getInstrumentConfig(ticker);
  const metrics = calculateMetrics(safeState, ticker);
  const setup = metrics.setup;
  const conclusion = metrics.conclusion;
  const dateLabel = fmtDate(parseDateStr(day));
  const blocks = [
    headingBlock("Daily Summary"),
    paragraphBlock(
      `${ticker} on ${dateLabel}. Setup ${setup.label}. Readiness ${metrics.readiness}%. Net R ${metrics.netR}. Trade count ${safeState.trades.length}.`
    ),
    paragraphBlock(
      `Bias ${formatBiasLabel(safeState.bias)}. Conclusion ${conclusion.label}. Day type ${safeState.narrativeProfile.dayType || "-"}. Macro theme ${safeState.macroTheme || "-"}.`
    ),
    headingBlock("Protocol"),
    paragraphBlock(
      `Daily prep: wait first 30 ${safeState.dailyPrep.waitFirstThirty ? "yes" : "no"} | previous day levels marked ${safeState.dailyPrep.levelsMarked ? "yes" : "no"} | event risk reviewed ${safeState.dailyPrep.eventRiskChecked ? "yes" : "no"}`
    ),
    paragraphBlock(
      `Matrix read: ${setup.label} | Conclusion: ${conclusion.label} | Detail: ${conclusion.detail}`
    ),
    headingBlock(instrument.requiresSessionProfile ? "Session Profile" : "Flow Context"),
    paragraphBlock(
      `VAH ${safeState.sessionProfile.vah || "-"} | VAL ${safeState.sessionProfile.val || "-"} | POC ${safeState.sessionProfile.poc || "-"} | VWAP ${safeState.sessionProfile.vwap || "-"}`
    ),
    paragraphBlock(`LVN / gap notes: ${safeState.sessionProfile.lvn || "-"}`),
    paragraphBlock(setup.detail),
    headingBlock("Narrative Builder"),
    paragraphBlock(`Previous cash close: ${safeState.narrativeProfile.prevCashClose || "-"}`),
    paragraphBlock(`Today open: ${safeState.narrativeProfile.todayOpen || "-"}`),
    paragraphBlock(`Value context: ${safeState.narrativeProfile.valueContext || "-"}`),
    paragraphBlock(`Profile location: ${safeState.narrativeProfile.profileLocation || "-"}`),
    paragraphBlock(`Auction state: ${safeState.narrativeProfile.auctionState || "-"}`),
    paragraphBlock(`Liquidity path: ${safeState.narrativeProfile.liquidityPath || "-"}`),
    paragraphBlock(`Profile note: ${safeState.narrativeProfile.profileNote || "-"}`),
    headingBlock("Orderflow Conclusion"),
    paragraphBlock(`HTF POI: ${safeState.premarket.htfPoi || "-"}`),
    paragraphBlock(`Orderflow read: ${safeState.premarket.orderFlow || "-"}`),
    paragraphBlock(`Initiative: ${safeState.premarket.initiative || "-"}`),
    paragraphBlock(`Response: ${safeState.premarket.response || "-"}`),
    paragraphBlock(`CVD / delta: ${safeState.premarket.cvdState || "-"}`),
    paragraphBlock(`Tape state: ${safeState.premarket.tapeState || "-"}`),
    paragraphBlock(`Execution lane: ${safeState.premarket.executionLane || "-"}`),
    paragraphBlock(`Session liquidity: ${safeState.premarket.sessionLiquidity || "-"}`),
    paragraphBlock(`Conclusion detail: ${conclusion.detail}`),
    headingBlock("Bias Notes"),
    paragraphBlock(safeState.biasNotes || "-"),
    headingBlock("Playbook"),
    paragraphBlock(`Mood: ${safeState.premarket.mood || "-"}`),
    paragraphBlock(`Key level: ${safeState.keyLevel || "-"}`),
    paragraphBlock(`Playbook focus: ${safeState.playbookFocus || "-"}`),
    paragraphBlock(`Rule of day: ${safeState.ruleOfDay || "-"}`),
    paragraphBlock(`Trade narrative: ${safeState.premarket.thesisNarrative || "-"}`),
    paragraphBlock(`Execution review: ${safeState.executionReview || "-"}`),
    headingBlock("Checklist")
  ];

  const checklistItems = [
    ["Bias defined before first trade", Boolean(safeState.bias)],
    ["First 30-minute rule confirmed", safeState.dailyPrep.waitFirstThirty],
    ["Previous day levels are marked", safeState.dailyPrep.levelsMarked],
    ["Event risk reviewed", safeState.dailyPrep.eventRiskChecked],
    ["Profile map complete", Boolean(safeState.sessionProfile.poc)],
    ["Narrative profile complete", Boolean(safeState.narrativeProfile.dayType)],
    ["Orderflow conclusion complete", Boolean(safeState.premarket.executionLane)]
  ];

  if (instrument.requiresSessionProfile) {
    checklistItems.splice(
      5,
      0,
      ["Session profile close context set", Boolean(safeState.sessionProfile.yestClose)],
      ["Session profile open context set", Boolean(safeState.sessionProfile.todayOpen)]
    );
  }

  checklistItems.forEach(([text, checked]) => {
    blocks.push(todoBlock(text, checked));
  });

  blocks.push(headingBlock("Trades"));
  if (!safeState.trades.length) {
    blocks.push(paragraphBlock("No trades logged."));
  } else {
    safeState.trades.forEach((trade, index) => {
      blocks.push(
        bulletBlock(
          `${index + 1}. ${trade.loggedAt || "-"} | ${trade.session || "-"} | ${trade.model || "-"} | ${trade.dir} | Entry ${trade.entry} | Exit ${trade.exit || "-"} | Planned RR ${trade.plannedRR || "-"} | R ${trade.r || "-"}`
        )
      );
      blocks.push(paragraphBlock(`Narrative fit: ${trade.narrativeFit || "-"} | Trigger: ${trade.trigger || "No trigger"}`));
      blocks.push(paragraphBlock(`Notes: ${trade.notes || "-"}`));
    });
  }

  return blocks;
}

async function findExistingPage(notion, journalKey) {
  const result = await notion.databases.query({
    database_id: process.env.NOTION_DATABASE_ID,
    filter: {
      property: "Journal Key",
      rich_text: {
        equals: journalKey
      }
    },
    page_size: 1
  });

  return result.results[0] ?? null;
}

async function listAllChildren(notion, pageId) {
  let cursor = undefined;
  const children = [];

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor
    });
    children.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return children;
}

async function replaceChildren(notion, pageId, blocks) {
  const existing = await listAllChildren(notion, pageId);
  for (const block of existing) {
    await notion.blocks.delete({ block_id: block.id });
  }

  for (let index = 0; index < blocks.length; index += 100) {
    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks.slice(index, index + 100)
    });
  }
}

export async function GET() {
  return NextResponse.json({
    configured: notionConfigured(),
    databaseId: process.env.NOTION_DATABASE_ID || null
  });
}

export async function POST(request) {
  if (!notionConfigured()) {
    return NextResponse.json(
      {
        error:
          "Notion sync is not configured. Add NOTION_TOKEN and NOTION_DATABASE_ID first."
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { ticker, day, state } = body;

    if (!ticker || !day || !state) {
      return NextResponse.json(
        { error: "ticker, day, and state are required." },
        { status: 400 }
      );
    }

    const notion = getNotion();
    const journalKey = createJournalKey(ticker, day);
    const properties = buildProperties({ ticker, day, state });
    const blocks = buildBlocks({ ticker, day, state });
    const existingPage = await findExistingPage(notion, journalKey);

    if (existingPage) {
      await notion.pages.update({
        page_id: existingPage.id,
        properties
      });
      await replaceChildren(notion, existingPage.id, blocks);

      return NextResponse.json({
        ok: true,
        mode: "updated",
        pageId: existingPage.id,
        pageUrl: existingPage.url
      });
    }

    const created = await notion.pages.create({
      parent: {
        database_id: process.env.NOTION_DATABASE_ID
      },
      properties,
      children: blocks
    });

    return NextResponse.json({
      ok: true,
      mode: "created",
      pageId: created.id,
      pageUrl: created.url
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message || "Failed to sync journal to Notion."
      },
      { status: 500 }
    );
  }
}
