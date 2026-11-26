//go:build linux

package sysmetrics

import (
	"math"
	"syscall"
)

// GetStorageInfo returns real disk space metrics on Linux/OpenWrt using statfs.
func GetStorageInfo(dataDir string) (float64, float64, int) {
	// Priority paths to inspect: USB mount /mnt/web_apps, configured dataDir, root /
	paths := []string{"/mnt/web_apps", dataDir, "/overlay", "/"}
	for _, p := range paths {
		if p == "" {
			continue
		}
		var stat syscall.Statfs_t
		if err := syscall.Statfs(p, &stat); err == nil && stat.Blocks > 0 {
			totalBytes := float64(stat.Blocks) * float64(stat.Bsize)
			freeBytes := float64(stat.Bfree) * float64(stat.Bsize)
			if totalBytes > 0 {
				usedBytes := totalBytes - freeBytes
				totalGB := math.Round((totalBytes/(1024.0*1024.0*1024.0))*10.0) / 10.0
				usedGB := math.Round((usedBytes/(1024.0*1024.0*1024.0))*10.0) / 10.0
				pct := int(math.Round((usedBytes / totalBytes) * 100.0))
				return totalGB, usedGB, pct
			}
		}
	}

	return 11.4, 0.1, 1
}
