;
; count-types.scm -- Pipeline that counts Atom types in the AtomSpace
;
; This file defines an Atomese pipeline that analyzes the contents of
; an AtomSpace, counting how many Atoms of each type exist, sorting
; the results by count (most frequent first), and returning the
; results as a formatted Value suitable for graphing.
;
; All pipeline definitions are pure Atomese - no cog-execute! calls.
; The pipeline is triggered by executing (Name "type-counts").
;
; The pipeline stages are:
; 1. Get all atoms via MeetLink
; 2. Extract the Type of each atom
; 3. Count occurrences of each type (IncrementValue)
; 4. Deduplicate to get unique types
; 5. Sort by count (descending)
; 6. Format as output structure for graphing
;
(use-modules (opencog))

; ---------------------------------------------------------------
; Define the comparison predicate for sorting types by count.
; This orders types by their count (descending - highest first).
; The NotLink trick ensures that types with equal counts are not
; discarded (since they compare as not-equal to each other).
;
(DefineLink
	(DefinedPredicate "count-order")
	(Lambda
		(VariableList (Variable "left") (Variable "right"))
		(Not
			(LessThan
				(ElementOf (Number 2)
					(ValueOf (Variable "left") (Predicate "cnt")))
				(ElementOf (Number 2)
					(ValueOf (Variable "right") (Predicate "cnt")))))))

; ---------------------------------------------------------------
; The type-counting pipeline for graphing atom type distribution.
;
; This pipeline:
; - Gets all atoms in the AtomSpace (via MeetLink)
; - Extracts the Type of each atom
; - Counts each type occurrence (attaching count to TypeNode)
; - Deduplicates to get unique types
; - Sorts by count (descending)
; - Formats output with type name and count
;
; The result is a LinkValue (table) where each row is a LinkValue:
;   (LinkValue
;     (LinkValue (Type 'ConceptNode) (FloatValue 0 0 42))
;     (LinkValue (Type 'ListLink) (FloatValue 0 0 10))
;     ...)
;
; Note: Running this multiple times will accumulate counts. If fresh
; counts are needed, the "cnt" values on TypeNodes should be cleared
; first, or use a fresh child AtomSpace.
;
(PipeLink
	(Name "type-counts")
	(Filter
		(Rule
			(TypedVariable (Variable "$typ") (Type 'Type))
			; Guard: only accept types that have a count attached
			(And
				(Present (Variable "$typ"))
				(Equal
					(Type 'FloatValue)
					(TypeOf (ValueOf (Variable "$typ") (Predicate "cnt")))))
			; Output: table row with type and count
			(LinkSignature (Type 'LinkValue)
				(Variable "$typ")
				(ValueOf (Variable "$typ") (Predicate "cnt"))))
		; Input: sorted unique types
		(LinkSignature
			(TypeNode 'SortedValue)
			(DefinedPredicate "count-order")
			; Input: unique types (deduplicated)
			(CollectionOf (TypeNode 'UnisetValue)
				; Input: types extracted from atoms, with counts attached
				(Filter
					(Rule
						(TypedVariable (Variable "$typ") (Type 'Type))
						(Variable "$typ")
						; Increment the count on this TypeNode, return TypeNode (not count)
						(IncrementValueOn (Variable "$typ") (Predicate "cnt") (Number 0 0 1)))
					; Input: types of all atoms
					(Filter
						(Rule
							(TypedVariable (Variable "$atom") (Type 'Atom))
							(Variable "$atom")
							(TypeOf (DontExec (Variable "$atom"))))
						; Input: all atoms in the base (dataset) AtomSpace
						(PureExec
							(AtomSpaceOf (Link))
							(Meet
								(Variable "$atom")
								(Variable "$atom")))))))))

; ---------------------------------------------------------------
