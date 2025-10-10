#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
if (!GITHUB_TOKEN) {
  throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required');
}

const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Create an MCP server
const server = new McpServer({
  name: "github-server",
  version: "0.1.0"
});

// Add a tool for getting PR reviews
server.tool(
  "get_pr_reviews",
  {
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    pull_number: z.number().describe("Pull request number"),
  },
  async ({ owner, repo, pull_number }) => {
    try {
      // Get PR reviews
      const { data: reviews } = await octokit.pulls.listReviews({
        owner,
        repo,
        pull_number,
      });

      // Get PR comments
      const { data: comments } = await octokit.pulls.listReviewComments({
        owner,
        repo,
        pull_number,
      });

      // Get PR details
      const { data: pr } = await octokit.pulls.get({
        owner,
        repo,
        pull_number,
      });

      const result = {
        pr: {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          merged: pr.merged,
          mergeable: pr.mergeable,
          mergeable_state: pr.mergeable_state,
          head: {
            sha: pr.head.sha,
            ref: pr.head.ref,
          },
          base: {
            ref: pr.base.ref,
          },
          created_at: pr.created_at,
          updated_at: pr.updated_at,
        },
        reviews: reviews.map(review => ({
          id: review.id,
          user: review.user?.login,
          body: review.body,
          state: review.state,
          commit_id: review.commit_id,
          submitted_at: review.submitted_at,
        })),
        comments: comments.map(comment => ({
          id: comment.id,
          user: comment.user?.login,
          body: comment.body,
          path: comment.path,
          position: comment.position,
          commit_id: comment.commit_id,
          created_at: comment.created_at,
        })),
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `GitHub API error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('GitHub MCP server running on stdio');