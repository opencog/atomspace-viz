;
; analytics-server.scm -- Configure and start the analytics CogServer
;
; This file defines the bootloader that starts a CogServer to serve
; the analytics AtomSpace. The analytics AtomSpace is a child of the
; data AtomSpace, giving it read access to all data while keeping
; generated atoms isolated.
;
; The web port is read from (Anchor "cfg-params") (Predicate "web-port"),
; which is set by the browser before triggering the bootloader.
; Telnet and MCP are disabled (port 0).
;
; Pure Atomese - no Scheme code, so it can be stored in RocksDB.
;
(use-modules (opencog) (opencog cogserver))

; ---------------------------------------------------------------
; The bootloader - configures and starts the analytics CogServer.
; When triggered, this:
; 1. Copies the web port from cfg-params Anchor to the CogServerNode
; 2. Disables telnet (port 0)
; 3. Disables MCP (port 0)
; 4. Starts the server
;
(PipeLink
	(Name "bootloader")
	(TrueLink
		(SetValue
			(CogServerNode "analytics")
			(Predicate "*-web-port-*")
			(ValueOf (Anchor "cfg-params") (Predicate "web-port")))
		(SetValue
			(CogServerNode "analytics")
			(Predicate "*-telnet-port-*")
			(Number 0))
		(SetValue
			(CogServerNode "analytics")
			(Predicate "*-mcp-port-*")
			(Number 0))
		(SetValue
			(CogServerNode "analytics")
			(Predicate "*-start-*"))))

; ---------------------------------------------------------------
