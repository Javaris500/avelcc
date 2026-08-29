# Write-gateway fixtures

**Status: `[constructed]`, not `[recorded]`.** This matters and is the reason
this file exists.

The read-side fixtures beside these (`express.json`, `octocat-hello-world.json`,
`spoon-knife.json`) are real GitHub responses, captured by making the call. That
is impossible here. Every call these fixtures stand in for **writes** — a blob,
a tree, a commit, a ref, a pull request — so recording one means performing one
against a real repository, which the write gateway exists to make safe and
reviewable rather than casual. No live write was made to produce any of these.

So the bodies below are assembled from GitHub's documented response schemas for
each endpoint, narrowed to the fields the gateway reads. What that buys and what
it does not:

- It proves the gateway sends the right request and reads the right field out of
  a well-formed response.
- It does **not** prove GitHub's real response matches this shape. If a field
  were renamed or nested differently, these fixtures would agree with the
  gateway and both would be wrong together.

The blob SHAs are the exception and are real. `blob-crlf.json` and
`blob-utf8.json` carry SHAs produced by `git hash-object` on the exact bytes the
test sends, so the value the gateway checks its own encoding against comes from
git rather than from this project:

| file | bytes | `git hash-object` |
|---|---|---|
| CRLF, `line one\r\nline two\r\n` | 20 | `cf9b2a85b62bc2fd67c5ed43a1d0009df848ac8a` |
| UTF-8, `héllo — 世界 🚀\n` | 23 | `86a7b568d11a87bab070e35ccda8ee4eb12a2a43` |

`ref-created.json` is the create-a-reference response; note it is the same
shape as `ref-updated.json`, which is why `CreatedRef` is an alias rather than a
second type.

`commit-fetched.json` is the get-a-commit response, and its two SHAs are
synthetic like the rest. The FACT it stands for is not, and is recorded here
because it is the reason `getCommit` exists at all. Checked live by avel-96
against `octocat/Spoon-Knife`:

    GET /git/trees/main   -> sha d0dd1f61...
    GET /commits/main     -> sha d0dd1f61...   (the same value)
    commit.commit.tree    -> sha d7cee29e...   (a different value)

The trees endpoint echoes back the resolved COMMIT sha, not the tree's. So
`RemoteTree.commitSha` is correctly named, and a caller holding it does NOT hold
something it can pass to `createTree` as `base_tree`. The fixture's two SHAs are
deliberately different from each other and a test asserts it, so the distinction
survives even though the values are made up.

The error bodies are the message strings GitHub documents for each condition.
The 422 mapping reads them, which is the one place in the module that parses a
message; `classifyUnprocessable` says why and what happens when none matches.

**To promote any of these to `[recorded]`:** capture the response from a real
call against a scratch repository that nobody depends on, and say so here. Until
then the label stands.
