const index = ({ activeGroups, cacheDuration, maxReq, maxReqWindow, version }: { activeGroups: { name: string; lastUpdateTle: string; lastUpdateJson: string; lastUpdateCsv: string }[]; cacheDuration: number; maxReq: number; maxReqWindow: number; version: string }) => (
	<html lang="en">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<meta http-equiv="X-UA-Compatible" content="ie=edge" />
			<meta name="description" content="Celestrak TLE caching server" />
			<meta name="keywords" content="TLE, Celestrak, satellite, cache, satrx" />
			<meta name="author" content="MrTalon63" />
			<meta name="theme-color" content="#3c4258" />
			<meta property="og:title" content="ReTLEctor" />
			<meta property="og:description" content="Celestrak TLE caching server" />
			<meta property="og:image" content="https://retlector.eu/retlector.png" />
			<meta property="og:type" content="website" />
			<meta name="twitter:card" content="summary" />
			<meta name="twitter:title" content="ReTLEctor" />
			<meta name="twitter:description" content="Celestrak TLE caching server" />
			<meta name="robots" content="index, follow" />
			<link rel="canonical" href="https://retlector.eu" />
			<link rel="icon" href="/favicon.ico" type="image/x-icon" />
			<title>ReTLEctor</title>
			<link rel="stylesheet" href="/styles.css" />
		</head>
		<body>
			<header>
				<div class="header-inner">
					<div>
						<h1>ReTLEctor</h1>
						<p>Celestrak TLE caching proxy - v{version}</p>
					</div>
					<a class="header-gh btn" href="https://github.com/MrTalon63/ReTLEctor" target="_blank">
						GitHub repository
					</a>
				</div>
			</header>
			<main>
				<div class="card">
					<h2>About</h2>
					<p>A lightweight proxy that caches TLEs from Celestrak to prevent rate-limiting when fetching a lot of data.</p>
					<p>
						Supported formats: <br />
						<strong>3LE</strong> - <code>/tle/[group]</code> <br />
						<strong>JSON CCSDS OMM</strong> - <code>/json/[group]</code> <br />
						<strong>CSV CCSDS OMM</strong> - <code>/csv/[group]</code>
					</p>
					<p>
						Custom NORAD ID lookup (experimental, 3LE only): <code>/norad/[NORAD_ID]</code>
					</p>
				</div>

				<div class="card table-card">
					<h2>Cached Groups</h2>
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Group</th>
									<th>Last Update (TLE)</th>
									<th>Last Update (JSON)</th>
									<th>Last Update (CSV)</th>
								</tr>
							</thead>
							<tbody>
								{activeGroups.map((group) => (
									<tr>
										<td data-label="Group">
											<code>{group.name}</code>
										</td>
										<td data-label="Last Update (TLE)">{group.lastUpdateTle}</td>
										<td data-label="Last Update (JSON)">{group.lastUpdateJson}</td>
										<td data-label="Last Update (CSV)">{group.lastUpdateCsv}</td>
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
				<a class="btn" href="https://github.com/MrTalon63/ReTLEctor" target="_blank">
					View Source on GitHub
				</a>
			</main>
		</body>
	</html>
);

export default index;
