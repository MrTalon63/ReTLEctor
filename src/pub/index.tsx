import config from "../utils/config";
import type { TleStatusInfo } from "../utils/tleStatus";

interface ActiveGroup {
	name: string;
	lastUpdate: string;
	status?: TleStatusInfo;
}

const renderBadge = (info?: TleStatusInfo, fallbackText?: string) => {
	if (!info) return <span>{fallbackText || "Never"}</span>;
	return (
		<span class={`status-badge badge-${info.status}`} title={info.isoDate !== "Never" ? `Updated: ${info.isoDate}` : "Never cached"}>
			<span class="status-dot"></span>
			<span class="badge-label">{info.label}</span>
		</span>
	);
};

const index = ({
	activeGroups,
	cacheDuration,
	maxReq,
	maxReqWindow,
	version,
	siteUrl = config.siteUrl,
	githubUrl = config.githubUrl,
	appName = config.appName,
}: {
	activeGroups: ActiveGroup[];
	cacheDuration: number;
	maxReq: number;
	maxReqWindow: number;
	version: string;
	siteUrl?: string;
	githubUrl?: string;
	appName?: string;
}) => (
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<meta http-equiv="X-UA-Compatible" content="ie=edge" />
			<meta name="description" content="Celestrak orbital data caching server" />
			<meta name="keywords" content="orbital data, TLE, 3LE, Celestrak, satellite, cache, satrx" />
			<meta name="author" content="MrTalon63" />
			<meta name="theme-color" content="#3c4258" />
			<meta property="og:title" content={appName} />
			<meta property="og:description" content="Celestrak orbital data caching server" />
			<meta property="og:image" content={siteUrl ? `${siteUrl.replace(/\/$/, "")}/retlector.png` : "/retlector.png"} />
			<meta property="og:type" content="website" />
			<meta name="twitter:card" content="summary" />
			<meta name="twitter:title" content={appName} />
			<meta name="twitter:description" content="Celestrak orbital data caching server" />
			<meta name="robots" content="index, follow" />
			{siteUrl ? <link rel="canonical" href={siteUrl} /> : null}
			<link rel="icon" href="/favicon.ico" type="image/x-icon" />
			<title>{appName}</title>
			<link rel="stylesheet" href="/styles.css" />
		</head>
		<body>
			<header>
				<div class="header-inner">
					<div>
						<h1>{appName}</h1>
						<p>Celestrak orbital data caching proxy - v{version}</p>
					</div>
					<a class="header-gh btn" href={githubUrl} target="_blank">
						GitHub repository
					</a>
				</div>
			</header>
			<main>
				<div class="card">
					<h2>About</h2>
					<p>
						A lightweight proxy that caches orbital data (GP) from
						<a href="https://celestrak.org/"> Celestrak</a> to prevent rate-limiting when fetching a lot of data.
					</p>
					<p>
						Supported formats: <br />
						<strong>CSV CCSDS OMM (Default)</strong> - <code>/[group]</code> or <code>/[group]/csv</code> &bull;{" "}
						<code>/[NORAD_ID]</code> or <code>/[NORAD_ID]/csv</code> <br />
						<strong>JSON CCSDS OMM</strong> - <code>/[group]/json</code> &bull; <code>/[NORAD_ID]/json</code> <br />
						<strong>KVN CCSDS OMM</strong> - <code>/[group]/kvn</code> &bull; <code>/[NORAD_ID]/kvn</code> <br />
						<strong>3LE</strong> - <code>/[group]/tle</code> (or <code>/3le</code>) &bull; <code>/[NORAD_ID]/tle</code> (or{" "}
						<code>/3le</code>) <br />
						<strong>Group Status</strong> - <code>/[group]/status</code>
					</p>
					<p>
						API (v1): <code>/api/v1/groups</code> &bull; <code>/api/v1/formats</code> &bull; <a href="/openapi">OpenAPI Docs</a>
					</p>
				</div>

				<div class="card table-card">
					<div class="table-header">
						<h2>Cached Groups</h2>
						<div class="status-legend" title="Freshness indicators based on configured cache refresh threshold">
							<span class="legend-item">
								<span class="status-dot dot-fresh"></span> Fresh
							</span>
							<span class="legend-item">
								<span class="status-dot dot-stale"></span> Stale
							</span>
							<span class="legend-item">
								<span class="status-dot dot-expired"></span> Expired
							</span>
							<span class="legend-item">
								<span class="status-dot dot-never"></span> Never
							</span>
						</div>
					</div>
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Group</th>
									<th>Status</th>
									<th>Last Updated</th>
									<th>Endpoints</th>
								</tr>
							</thead>
							<tbody>
								{activeGroups.map((group) => (
									<tr>
										<td data-label="Group">
											<code>{group.name}</code>
										</td>
										<td data-label="Status">{renderBadge(group.status, group.lastUpdate)}</td>
										<td data-label="Last Updated">
											<span class="timestamp-text">{group.lastUpdate}</span>
										</td>
										<td data-label="Endpoints" class="endpoint-links">
											<a href={`/${group.name}/csv`}>CSV</a> &bull; <a href={`/${group.name}/json`}>JSON</a> &bull;{" "}
											<a href={`/${group.name}/tle`}>3LE</a> &bull; <a href={`/${group.name}/kvn`}>KVN</a> &bull;{" "}
											<a href={`/${group.name}/status`}>Status</a>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>

				<div class="meta">
					<span>Cache refresh: ~{cacheDuration / 1000 / 60} min</span>
					<span>
						Rate limit: {maxReq} req / {maxReqWindow / 1000}s (Follow http headers for accurate rate limit info)
					</span>
				</div>
				<a class="btn" href={githubUrl} target="_blank">
					View Source on GitHub
				</a>
			</main>
		</body>
	</html>
);

export default index;
