;
; pair-mi.scm -- Pipeline that counts pairs from pair-generator
;
; This file defines an Atomese pipeline that counts the number of
; pairs produced by the pair-generator. The pair-generator is set up
; dynamically from the web UI with a Meet pattern based on user selection.
;
; The pipeline is triggered by executing (Name "pair-counter").
;
; The web UI sets up four items on the analytics anchor:
;   - "pair generator": DontExec(Meet) for generating pairs
;   - "pair premise": Lambda for pair counts
;   - "left marginal": Lambda that when Put with left value gives left's marginal Lambda
;   - "right marginal": Lambda that when Put with right value gives right's marginal Lambda
;
; All counts are stored on LambdaLinks (not MeetLinks) to avoid accidental execution.
;
(use-modules (opencog))

; ---------------------------------------------------------------
; The pair-counting pipeline.
;
; Stage 1: Count all pairs and build marginal/pair counts
; For each pair (left-val, right-val), we increment:
;   1. Total count on the pair premise Lambda
;   2. Left marginal: Lambda for this left item (via Put on left marginal)
;   3. Right marginal: Lambda for this right item (via Put on right marginal)
;   4. Pair count: Lambda for this specific pair (via Put on pair premise)
;
; Note: We don't use PureExec because we want counts to persist in main atomspace.
;
(PipeLink
	(Name "pair-counter")
	; Count all pairs and build marginal/pair counts
	; Returns BoolValue(true) when complete
	(True
		(Filter
			(Rule
				(VariableList (Variable "left") (Variable "right"))
				(LinkSignature (Type 'LinkValue) (Variable "left") (Variable "right"))
				; All increments - return value ignored by True
				(LinkValue
					; 1. Total count on the pair premise Lambda
					(IncrementValue
						(ValueOf (Anchor "analytics") (Predicate "pair premise"))
						(Predicate "total")
						(Number 1))
					; 2. Left marginal - count for this left item across all right items
					;    Put left value into left marginal Lambda to get the specific Lambda
					(IncrementValue
						(Put
							(ValueOf (Anchor "analytics") (Predicate "left marginal"))
							(Variable "left"))
						(Predicate "count")
						(Number 1))
					; 3. Right marginal - count for this right item across all left items
					;    Put right value into right marginal Lambda to get the specific Lambda
					(IncrementValue
						(Put
							(ValueOf (Anchor "analytics") (Predicate "right marginal"))
							(Variable "right"))
						(Predicate "count")
						(Number 1))
					; 4. Pair count - count for this specific pair
					;    Put (left, right) into pair premise to get the specific edge Lambda
					(IncrementValue
						(Put
							(ValueOf (Anchor "analytics") (Predicate "pair premise"))
							(List (Variable "left") (Variable "right")))
						(Predicate "count")
						(Number 1))))
			; Input: pairs from the Meet stored on the anchor
			(ValueOf (Anchor "analytics") (Predicate "pair generator")))))

; Stage 2: Fetch the total count from pair premise Lambda
; Call this AFTER pair-counter has been triggered
(PipeLink
	(Name "get total count")
	(ValueOf
		(ValueOf (Anchor "analytics") (Predicate "pair premise"))
		(Predicate "total")))

; ---------------------------------------------------------------
