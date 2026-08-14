# GitHub MCP Integration Rules

When interacting with GitHub operations, repositories, pull requests, issues, commits, or code search in this workspace:

1. **Standard GitHub Protocol**: Always use the **GitHub MCP Server** tools (`call_mcp_tool` with `ServerName: "github"`) as the first-class standard for all GitHub operations instead of ad-hoc web scraping, manual curl calls, or requiring CLI token prompts.

2. **Available GitHub Operations**:
   - **Repository Exploration & Search**: `search_repositories`, `get_file_contents`, `list_commits`, `search_code`, `search_users`.
   - **Issues & Discussions**: `list_issues`, `get_issue`, `create_issue`, `update_issue`, `add_issue_comment`, `search_issues`.
   - **Pull Requests & Code Reviews**: `list_pull_requests`, `get_pull_request`, `create_pull_request`, `get_pull_request_files`, `get_pull_request_status`, `create_pull_request_review`, `merge_pull_request`, `update_pull_request_branch`, `get_pull_request_comments`, `get_pull_request_reviews`.
   - **Branching & Git Operations**: `create_branch`, `create_or_update_file`, `push_files`, `fork_repository`.

3. **Security & Credentials**:
   - The personal access token is configured exclusively in the user-level global configuration (`~/.gemini/config/mcp_config.json`) or OS user environment variables.
   - Never write or hardcode GitHub access tokens into project files, commits, scripts, or git-tracked configuration files.
