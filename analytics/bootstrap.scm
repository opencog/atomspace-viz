;
; bootstrap.scm -- Bootstrap the analytics subsystem
;
; This file provides the bootstrap mechanism for loading analytics
; pipelines from RocksDB into a child AtomSpace at runtime.
;
; The child AtomSpace has full visibility into the parent (data) space,
; but generated atoms stay in the child, avoiding pollution of the
; dataset. This allows analytics to run concurrently with data updates.
;
; Individual analytics pipelines (like "type-counts") are triggered
; directly by the web browser when the user clicks on buttons/menus.
;
; XXX This is currently dead code -- the working version of this code
; has been copied into the analytics.js javascript web page.  So the
; below is an example of what it "could be like". Perhaps in the future
; this should be wrapped with some SensoryNode or something so that we
; don't hard-code stuff like this in javasscript.
;
(use-modules (opencog) (opencog persist) (opencog persist-rocks))

; ---------------------------------------------------------------
; Create a child AtomSpace for analytics execution.
; The child is layered on top of the current AtomSpace, giving it
; full read access to the parent while keeping generated atoms
; isolated in the child space.
;
(AtomSpace "analytics" (AtomSpaceOf (Link)))

; ---------------------------------------------------------------
; Load analytics code from RocksDB into the child AtomSpace.
; This brings in all pipeline definitions (like "type-counts").
;
; After loading, individual pipelines can be triggered directly:
;   (TriggerLink (Name "type-counts"))
;
(define load-analytics
	(PureExec
		(AtomSpace "analytics")
		; Open the analytics storage
		(SetValue
			(RocksStorageNode "rocks:///usr/local/share/cogserver/analytics")
			(Predicate "*-open-*")
			(AtomSpace "analytics"))
		; Load analytics code into child space
		(SetValue
			(RocksStorageNode "rocks:///usr/local/share/cogserver/analytics")
			(Predicate "*-load-atomspace-*"))
		; Start the analytics CogServer
		(Name "bootloader")))

; ---------------------------------------------------------------
; To load analytics:
;   (TriggerLink load-analytics)
;
; Then to run the type-counts pipeline:
;   (TriggerLink (Name "type-counts"))
;
; ---------------------------------------------------------------
