# We Love Delays — team collaboration

Our live website is https://we-love-delays.onrender.com and Render deploys changes from the `main` branch.

## Join
1. The repository owner invites you at **Settings → Collaborators → Add people**.
2. Accept the invitation on GitHub.
3. Connect GitHub to ChatGPT if you want help editing code. Confirm ChatGPT can access `Fearpepper/We-Love-Delays`.

## Make a change safely
1. Start from the latest `main`.
2. Create your own branch, for example `feature/rewards-fatima` or `fix/map-matteo`.
3. Ask ChatGPT to inspect the current code, edit **your branch**, and explain what changed. Never paste the 511 API key into ChatGPT or GitHub.
4. Test your change. Open a pull request from your branch into `main`.
5. Have another group member review it before merging.
6. Merge the pull request when ready. Render should automatically deploy the new `main` commit; confirm deployment succeeded before telling the team it is live.

**Do not commit directly to `main`** for ordinary work. Branch protection is a separate GitHub repository setting and must be enabled by the owner to enforce this rule.

## Prompt to give ChatGPT

> I am a collaborator on Fearpepper/We-Love-Delays. Please inspect the latest code. I want to [describe my change]. Create a separate feature branch, implement only this change, test what you can, and open a pull request into main. Do not push directly to main, modify Render settings, or claim the live site was tested unless you actually verified it. Preserve the existing design and clearly label simulated rewards.

## Conflict prevention
- Tell the group which feature you are working on before editing.
- Keep each pull request focused on one feature.
- If another PR changed the same file, update your branch from `main` and resolve conflicts before merging.
- A GitHub commit is not instantly visible on the website: Render needs to deploy it.

## Project notes
- Frontend: `index.html`
- Python server and 511 transit integration: `server.py`
- Render configuration: `render.yaml`
- 511 API key is stored in Render environment variables, **not** in repository files.
- Real bus data and fictional rewards must remain clearly distinguished.
