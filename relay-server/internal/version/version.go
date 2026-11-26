package version

var (
	// Version is the semantic release version of SmartHome Edge Relay Server
	Version = "2.0.0"

	// BuildType indicates release vs debug
	BuildType = "release"

	// BuildTime is injected at build time via -ldflags
	BuildTime = ""

	// GitCommit is injected at build time via -ldflags
	GitCommit = "HEAD"
)

// FullVersion returns the formatted version string
func FullVersion() string {
	if GitCommit != "" && GitCommit != "HEAD" {
		return Version + " (" + GitCommit + ")"
	}
	return Version
}
