/** @typedef {import('@actions/github').context} ActionsContext */
/** @typedef {import('@octokit/rest').Octokit} Octokit */
/** @typedef {typeof import('@actions/core')} Core */
/** @typedef {Octokit & { graphql: (query: string, variables: Record<string, unknown>) => Promise<unknown> }} GitHubWithGraphQL */

/**
 * @param {{ github: GitHubWithGraphQL; context: ActionsContext; core: Core }} deps
 */
module.exports = async function run({ github, context, core }) {
    try {
        const version = process.env.VERSION;
        if (!version) {
            core.setFailed('VERSION env is required.');
            return;
        }
        const owner = context.repo.owner;
        const repo = context.repo.repo;
        const labelName = 'waiting-for-release';

        core.info(
            `Fetching open issues labeled '${labelName}' to comment and close for release v${version}...`,
        );

        /** @type {Array<import('@octokit/rest').RestEndpointMethodTypes['issues']['listForRepo']['response']['data'][number]>} */
        const issues = await github.paginate(github.rest.issues.listForRepo, {
            owner,
            repo,
            state: 'open',
            labels: labelName,
            per_page: 100,
        });

        if (!issues.length) {
            core.info('No open issues with the label found.');
            return;
        }

        const releaseUrl = `https://github.com/${owner}/${repo}/releases/tag/v${version}`;
        for (const issue of issues) {
            try {
                if (issue.pull_request) {
                    core.info(`#${issue.number} is a pull request; skipping.`);
                    continue;
                }

                const body = [
                    `🎉 Version v${version} has been released: ${releaseUrl}`,
                    '',
                    'This issue was labeled `waiting-for-release` and is now being closed with the official release.',
                    'If the problem persists, please reopen this issue or file a new one.',
                ].join('\n');

                await github.rest.issues.createComment({
                    owner,
                    repo,
                    issue_number: issue.number,
                    body,
                });
                await github.rest.issues.update({
                    owner,
                    repo,
                    issue_number: issue.number,
                    state: 'closed',
                });
                core.info(`Commented and closed #${issue.number}.`);
            } catch (err) {
                core.warning(
                    `Failed to process #${issue.number}: ${err.message}`,
                );
            }
        }
    } catch (outerErr) {
        core.setFailed(`close-waiting-issues failed: ${outerErr.message}`);
    }
};
