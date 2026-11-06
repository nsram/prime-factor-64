# Prime Factor 64

Open `index.html` to choose Prime Factor 64, Fog Sweep 64, or the learning guide. Both activities use the same 64 multiplication results and run offline.

| File | Contents |
| --- | --- |
| `index.html` | Project home |
| `prime-factor-64.html` | Prime Factor 64 with timed matching and recall checks |
| `fog-sweep-64.html` | Fog Sweep 64 with two checkerboards, hidden tiles, and round reviews |
| `learning-guide.html` | Mental-math guide, worked examples, recall drill, and answer key |
| `prime-factor-64-history.html` | Case study, UI history, alternatives, and technical version log |
| `fog-sweep-64-history.html` | Fog Sweep 64 design history and four-version technical log |
| `styles.css` | Shared styling for the home page, learning guide, and original case study |

The separate `fog-sweep-64-git-diffs.zip` archive contains replayable patches for the four Fog Sweep 64 source versions.

## Push to GitHub

Create an empty repository named `prime-factor-64`. Unzip the package and run these commands from inside the extracted `prime-factor-64` folder. Replace `YOUR_REPOSITORY_REMOTE` with the repository's Git remote.

```sh
git init -b main
git add .
git commit -m "Add Prime Factor 64 and Fog Sweep 64"
git remote add origin YOUR_REPOSITORY_REMOTE
git push -u origin main
```

To publish with GitHub Pages, choose **Deploy from a branch** under **Settings → Pages**, then select **main** and **/(root)**. All paths are relative, so the same files work at the repository path.
